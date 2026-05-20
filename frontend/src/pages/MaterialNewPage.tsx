import { useNavigate } from 'react-router-dom';
import MaterialForm, { type MaterialFormValues } from '../components/MaterialForm';
import { materialsApi } from '../features/materials/api';
import styles from './MaterialFormPage.module.css';

export default function MaterialNewPage() {
  const navigate = useNavigate();

  async function handleSubmit(values: MaterialFormValues) {
    const tags = values.tags ? values.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    await materialsApi.create({
      title: values.title,
      body: values.body,
      language: values.language,
      difficulty: values.difficulty || undefined,
      tags,
      sourceType: 'manual',
      sourceUrl: values.sourceUrl || undefined,
    });
    navigate('/materials');
  }

  return (
    <div>
      <h1 className={styles.title}>新規教材</h1>
      <MaterialForm onSubmit={handleSubmit} submitLabel="作成" />
    </div>
  );
}
