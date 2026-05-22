import { useParams, Link } from 'react-router-dom';
import { attemptsApi, type AttemptDetail } from '../features/attempts/api';
import { useAsyncResource } from '../hooks/useAsyncResource';
import DiffViewer from '../components/DiffViewer';
import ScoreSummary from '../components/ScoreSummary';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import styles from './ResultPage.module.css';

export default function ResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { data: attempt, loading, error } = useAsyncResource<AttemptDetail>(
    () => attemptsApi.get(attemptId!),
    [attemptId],
  );

  if (loading) return <LoadingState />;
  if (error || !attempt) return <ErrorState message={error ?? '結果が見つかりません'} />;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>採点結果</h1>

      <ScoreSummary result={attempt.result} />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>差分ハイライト</h2>
        <div className={styles.legend}>
          <span className={styles.legendMissing}>聞き落とし</span>
          <span className={styles.legendExtra}>余分</span>
        </div>
        <DiffViewer diff={attempt.result.diff} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>あなたの回答</h2>
        <p className={styles.submitted}>{attempt.submittedText}</p>
      </section>

      <div className={styles.actions}>
        <Link to={`/practice/${attempt.materialId}`} className={styles.btnPrimary}>再挑戦</Link>
        <Link to="/materials" className={styles.btnSecondary}>教材一覧へ</Link>
      </div>
    </div>
  );
}
