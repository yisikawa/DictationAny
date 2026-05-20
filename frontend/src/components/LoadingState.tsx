import styles from './LoadingState.module.css';

export default function LoadingState({ message = '読み込み中…' }: { message?: string }) {
  return <div className={styles.wrap}><span className={styles.spinner} />{message}</div>;
}
