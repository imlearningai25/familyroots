import React from 'react';
import { Link } from 'react-router-dom';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted">
      <div className="bg-white p-8 rounded-xl shadow-sm w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Create account</h1>
        <p className="text-gray-500 text-sm mb-4">Registration coming soon.</p>
        <Link to="/login" className="text-brand-600 text-sm hover:underline">Back to login</Link>
      </div>
    </div>
  );
}
