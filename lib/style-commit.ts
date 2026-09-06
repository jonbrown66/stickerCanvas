export type StyleCommitBoundary<T> = {
  syncScope: (scope: string) => void;
  preview: (scope: string, value: T, onPreview: (value: T) => void) => void;
  commit: (scope: string, onCommit: (value: T) => void) => boolean;
};

/**
 * Keeps a live style preview and its final history commit together. A single
 * range interaction can end with pointer, keyboard, and blur events; only the
 * first completion after a preview is allowed to commit.
 */
export function createStyleCommitBoundary<T>(): StyleCommitBoundary<T> {
  let activeScope: string | null = null;
  let pendingValue: T | undefined;
  let hasPendingPreview = false;

  const syncScope = (scope: string) => {
    if (activeScope === scope) return;
    activeScope = scope;
    hasPendingPreview = false;
    pendingValue = undefined;
  };

  return {
    syncScope,
    preview: (scope, value, onPreview) => {
      syncScope(scope);
      pendingValue = value;
      hasPendingPreview = true;
      onPreview(value);
    },
    commit: (scope, onCommit) => {
      syncScope(scope);
      if (!hasPendingPreview) return false;
      hasPendingPreview = false;
      const value = pendingValue as T;
      pendingValue = undefined;
      onCommit(value);
      return true;
    },
  };
}
