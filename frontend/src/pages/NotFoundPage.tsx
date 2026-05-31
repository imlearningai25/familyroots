import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted">
      <div className="text-center">
        <p className="text-6xl font-bold text-brand-500 mb-4">404</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Page not found</h1>
        <Link to="/dashboard" className="text-brand-600 hover:underline">Go to dashboard</Link>
      </div>
    </div>
  );
}
