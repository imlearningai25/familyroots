import React from 'react';
import { Link } from 'react-router-dom';

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted">
      <div className="bg-white p-8 rounded-xl shadow-sm w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Reset password</h1>
        <p className="text-gray-500 text-sm mb-4">Password reset coming soon.</p>
        <Link to="/login" className="text-brand-600 text-sm hover:underline">Back to login</Link>
      </div>
    </div>
  );
}
