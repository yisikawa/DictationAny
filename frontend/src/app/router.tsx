import { createBrowserRouter } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import HomePage from '../pages/HomePage';
import MaterialsPage from '../pages/MaterialsPage';
import MaterialNewPage from '../pages/MaterialNewPage';
import MaterialEditPage from '../pages/MaterialEditPage';
import ImportNewPage from '../pages/ImportNewPage';
import ImportPdfPage from '../pages/ImportPdfPage';
import PracticePage from '../pages/PracticePage';
import ResultPage from '../pages/ResultPage';
import HistoryPage from '../pages/HistoryPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'materials', element: <MaterialsPage /> },
      { path: 'materials/new', element: <MaterialNewPage /> },
      { path: 'materials/:materialId/edit', element: <MaterialEditPage /> },
      { path: 'imports/new', element: <ImportNewPage /> },
      { path: 'imports/pdf', element: <ImportPdfPage /> },
      { path: 'practice/:materialId', element: <PracticePage /> },
      { path: 'results/:attemptId', element: <ResultPage /> },
      { path: 'history', element: <HistoryPage /> },
    ],
  },
]);
