import React, { useState, useEffect } from 'react';

const LOG_STYLES: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.85)',
    color: '#ff4444',
    zIndex: 9999,
    padding: '2rem',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    overflow: 'auto',
    pointerEvents: 'all',
};

export const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
    const [hasError, setHasError] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            setHasError(true);
            setError(event.error);
        };

        // Catch unhandled promise rejections
        const handleRejection = (event: PromiseRejectionEvent) => {
            setHasError(true);
            setError(new Error(`Unhandled Rejection: ${event.reason}`));
        };

        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleRejection);

        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleRejection);
        };
    }, []);

    if (hasError) {
        return (
            <div style={LOG_STYLES}>
                <h1>Something went wrong.</h1>
                <p>{error?.message}</p>
                <pre>{error?.stack}</pre>
                <button
                    onClick={() => window.location.reload()}
                    style={{
                        marginTop: '1rem',
                        padding: '0.5rem 1rem',
                        backgroundColor: '#fff',
                        color: '#000',
                        border: 'none',
                        cursor: 'pointer'
                    }}
                >
                    Reload Page
                </button>
            </div>
        );
    }

    return <>{children}</>;
};
