import { Link } from 'react-router-dom';
import type { Material } from '../types';
import styles from './MaterialCard.module.css';

interface Props {
  material: Material;
  onDelete?: (id: string) => void;
}

const difficultyLabel: Record<string, string> = {
  beginner: '初級', intermediate: '中級', advanced: '上級',
};

export default function MaterialCard({ material, onDelete }: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.lang}>{material.language}</span>
          {material.difficulty && (
            <span className={styles.difficulty}>{difficultyLabel[material.difficulty] ?? material.difficulty}</span>
          )}
        </div>
        <h3 className={styles.title}>{material.title}</h3>
        <p className={styles.preview}>{material.body.slice(0, 80)}{material.body.length > 80 ? '…' : ''}</p>
      </div>
      <div className={styles.actions}>
        <Link to={`/practice/${material.id}`} className={styles.btnPrimary}>練習する</Link>
        <Link to={`/materials/${material.id}/edit`} className={styles.btnSecondary}>編集</Link>
        {onDelete && (
          <button className={styles.btnDanger} onClick={() => onDelete(material.id)}>削除</button>
        )}
      </div>
    </div>
  );
}
