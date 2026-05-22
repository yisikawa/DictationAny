import { Link } from 'react-router-dom';
import { attemptsApi } from '../features/attempts/api';
import { useAsyncResource } from '../hooks/useAsyncResource';
import type { Attempt } from '../types';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import styles from './HistoryPage.module.css';

export default function HistoryPage() {
  const { data: attempts, loading, error } = useAsyncResource<Attempt[]>(
    () => attemptsApi.list(),
    [],
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  function scoreColor(score: number) {
    if (score >= 80) return styles.scoreHigh;
    if (score >= 50) return styles.scoreMid;
    return styles.scoreLow;
  }

  const list = attempts ?? [];

  return (
    <div>
      <h1 className={styles.title}>練習履歴</h1>
      {list.length === 0 ? (
        <p className={styles.empty}>まだ練習記録がありません。</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>日時</th>
              <th>スコア</th>
              <th>単語一致率</th>
              <th>文字一致率</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(a => (
              <tr key={a.id}>
                <td className={styles.date}>{new Date(a.createdAt).toLocaleString('ja-JP')}</td>
                <td><span className={`${styles.score} ${scoreColor(a.score)}`}>{a.score}</span></td>
                <td>{a.wordAccuracy}%</td>
                <td>{a.characterAccuracy}%</td>
                <td>
                  <Link to={`/results/${a.id}`} className={styles.link}>詳細</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
