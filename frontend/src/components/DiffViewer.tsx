import type { DiffToken } from '../types';
import styles from './DiffViewer.module.css';

interface Props { diff: DiffToken[] }

export default function DiffViewer({ diff }: Props) {
  return (
    <p className={styles.text}>
      {diff.map((token, i) => {
        if (token.type === 'equal')   return <span key={i} className={styles.equal}>{token.text} </span>;
        if (token.type === 'missing') return <span key={i} className={styles.missing}>[{token.text}] </span>;
        if (token.type === 'extra')   return <span key={i} className={styles.extra}>{token.text} </span>;
        if (token.type === 'replace') return (
          <span key={i}>
            <span className={styles.missing}>[{token.expected}]</span>
            <span className={styles.extra}>{token.actual} </span>
          </span>
        );
        return null;
      })}
    </p>
  );
}
