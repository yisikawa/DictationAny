import type { CompareResult } from '../types';
import styles from './ScoreSummary.module.css';

interface Props { result: CompareResult }

export default function ScoreSummary({ result }: Props) {
  const { score, wordAccuracy, characterAccuracy, missingWords, extraWords, possibleSpellingErrors } = result;

  return (
    <div className={styles.wrap}>
      <div className={styles.scoreCircle} style={{ '--score': score } as React.CSSProperties}>
        <span className={styles.scoreNum}>{score}</span>
        <span className={styles.scoreLabel}>スコア</span>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricVal}>{wordAccuracy}%</span>
          <span className={styles.metricLabel}>単語一致率</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricVal}>{characterAccuracy}%</span>
          <span className={styles.metricLabel}>文字一致率</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricVal}>{missingWords.length}</span>
          <span className={styles.metricLabel}>聞き落とし</span>
        </div>
      </div>

      {possibleSpellingErrors.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>スペルミスの可能性</h4>
          <ul className={styles.list}>
            {possibleSpellingErrors.map((e, i) => (
              <li key={i}><span className={styles.expected}>{e.expected}</span> → <span className={styles.actual}>{e.actual}</span></li>
            ))}
          </ul>
        </div>
      )}

      {missingWords.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>聞き落とした単語</h4>
          <p className={styles.words}>{missingWords.join(', ')}</p>
        </div>
      )}

      {extraWords.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>余分な単語</h4>
          <p className={styles.words}>{extraWords.join(', ')}</p>
        </div>
      )}
    </div>
  );
}
