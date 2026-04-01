import { useState, useCallback } from 'react';

export default function useHistory(initialState) {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState([initialState]);

  const setState = useCallback((newState, overwrite = false) => {
    if (overwrite) {
      setHistory([newState]);
      setIndex(0);
      return;
    }

    if (JSON.stringify(history[index]) === JSON.stringify(newState)) return;

    const newHistory = [...history.slice(0, index + 1), newState];
    const limitedHistory = newHistory.slice(-50);
    setHistory(limitedHistory);
    setIndex(limitedHistory.length - 1);
  }, [index, history]);

  const undo = useCallback(() => {
    if (index > 0) setIndex(prev => prev - 1);
  }, [index]);

  const redo = useCallback(() => {
    if (index < history.length - 1) setIndex(prev => prev + 1);
  }, [index, history.length]);

  return [history[index], setState, undo, redo, index > 0, index < history.length - 1];
}
