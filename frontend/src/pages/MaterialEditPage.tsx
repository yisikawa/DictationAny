import { useNavigate, useParams } from 'react-router-dom';
import MaterialForm, { type MaterialFormValues } from '../components/MaterialForm';
import { useMaterial } from '../features/materials/hooks';
import { materialsApi } from '../features/materials/api';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import styles from './MaterialFormPage.module.css';

export default function MaterialEditPage() {
  const { materialId } = useParams<{ materialId: string }>();
  const navigate = useNavigate();
  const { material, loading, error } = useMaterial(materialId!);

  async function handleSubmit(values: MaterialFormValues) {
    const tags = values.tags ? values.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    await materialsApi.update(materialId!, {
      title: values.title,
      body: values.body,
      language: values.language,
      difficulty: values.difficulty || undefined,
      tags,
      sourceUrl: values.sourceUrl || undefined,
    });
    navigate('/materials');
  }

  if (loading) return <LoadingState />;
  if (error || !material) return <ErrorState message={error ?? '教材が見つかりません'} />;

  return (
    <div>
      <h1 className={styles.title}>教材を編集</h1>
      <MaterialForm initial={material} onSubmit={handleSubmit} submitLabel="更新" />
    </div>
  );
}
