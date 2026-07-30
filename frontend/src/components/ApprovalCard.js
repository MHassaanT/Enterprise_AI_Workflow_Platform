// src/components/ApprovalCard.js
'use client';

export default function ApprovalCard({ title, status, onApprove, onReject }) {
  return (
    <div className="border rounded-lg p-4 shadow-sm bg-white">
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-sm text-gray-500 mb-3">Status: {status}</p>
      <div className="flex gap-2">
        <button 
          onClick={onApprove}
          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Approve
        </button>
        <button 
          onClick={onReject}
          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
