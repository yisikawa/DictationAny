import { Link } from 'react-router-dom';
import { useMaterials } from '../features/materials/hooks';
import MaterialCard from '../components/MaterialCard';
import LoadingState from '../components/LoadingState';
import styles from './HomePage.module.css';

export default function HomePage() {
  const { data, loading } = useMaterials(1);
  const recent = data?.items.slice(0, 3) ?? [];

  return (
    <div>
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>DictationAny</h1>
        <p className={styles.heroSub}>任意の文章でディクテーション練習</p>
        <div className={styles.heroActions}>
          <Link to="/materials/new" className={styles.btnPrimary}>教材を作成する</Link>
          <Link to="/materials" className={styles.btnSecondary}>教材一覧を見る</Link>
        </div>
      </div>

      {loading && <LoadingState />}
      {recent.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>最近の教材</h2>
          <div className={styles.list}>
            {recent.map(m => <MaterialCard key={m.id} material={m} />)}
          </div>
        </section>
      )}
    </div>
  );
}
