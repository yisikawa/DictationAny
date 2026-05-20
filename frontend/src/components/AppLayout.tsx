import { Outlet, NavLink } from 'react-router-dom';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <NavLink to="/" className={styles.logo}>DictationAny</NavLink>
        <nav className={styles.nav}>
          <NavLink to="/materials" className={({ isActive }) => isActive ? styles.active : ''}>教材</NavLink>
          <NavLink to="/history"   className={({ isActive }) => isActive ? styles.active : ''}>履歴</NavLink>
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
