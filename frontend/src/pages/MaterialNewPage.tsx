import { useNavigate } from 'react-router-dom';
import MaterialForm, { type MaterialFormValues } from '../components/MaterialForm';
import { materialsApi } from '../features/materials/api';
import { toMaterialPayload } from '../features/materials/payload';
import styles from './MaterialFormPage.module.css';

export default function MaterialNewPage() {
  const navigate = useNavigate();

  async function handleSubmit(values: MaterialFormValues) {
    await materialsApi.create({ ...toMaterialPayload(values), sourceType: 'manual' });
    navigate('/materials');
  }

  return (
    <div>
      <h1 className={styles.title}>新規教材</h1>
      <MaterialForm onSubmit={handleSubmit} submitLabel="作成" />
    </div>
  );
}
