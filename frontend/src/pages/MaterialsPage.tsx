import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMaterials } from '../features/materials/hooks';
import { materialsApi } from '../features/materials/api';
import MaterialCard from '../components/MaterialCard';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import styles from './MaterialsPage.module.css';

export default function MaterialsPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useMaterials(page);

  async function handleDelete(id: string) {
    if (!confirm('この教材を削除しますか？')) return;
    await materialsApi.delete(id);
    reload();
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>教材一覧</h1>
        <div className={styles.headerActions}>
          <Link to="/imports/pdf" className={styles.btnSecondary}>PDFから取り込む</Link>
          <Link to="/imports/new" className={styles.btnSecondary}>字幕から取り込む</Link>
          <Link to="/materials/new" className={styles.btnPrimary}>+ 新規教材</Link>
        </div>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && !loading && (
        <>
          {data.items.length === 0 ? (
            <p className={styles.empty}>教材がありません。「新規教材」から追加してください。</p>
          ) : (
            <div className={styles.list}>
              {data.items.map(m => (
                <MaterialCard key={m.id} material={m} onDelete={handleDelete} />
              ))}
            </div>
          )}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>前へ</button>
              <span>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>次へ</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
