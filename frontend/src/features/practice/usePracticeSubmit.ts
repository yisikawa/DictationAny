import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { attemptsApi } from '../attempts/api';

export function usePracticeSubmit(materialId: string) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent, input: string) {
    e.preventDefault();
    if (!input.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const attempt = await attemptsApi.create(materialId, input);
      navigate(`/results/${attempt.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '提出に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, submitError, handleSubmit };
}
