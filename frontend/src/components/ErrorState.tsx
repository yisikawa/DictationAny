import styles from './ErrorState.module.css';

export default function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={styles.wrap}>
      <p className={styles.message}>{message}</p>
      {onRetry && <button className={styles.btn} onClick={onRetry}>再試行</button>}
    </div>
  );
}
