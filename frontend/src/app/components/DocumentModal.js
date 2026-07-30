'use client';
import { useState, useEffect } from 'react';
import { fetchDocuments, uploadDocument, deleteDocument, getUser } from '@/lib/api';

export default function DocumentModal({ isOpen, onClose }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setUser(getUser());
      loadDocuments();
    }
  }, [isOpen]);

  const isAdmin = user?.role === 'admin';

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      const docs = await fetchDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err.message || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file) => {
    if (!isAdmin) return;
    if (!file) return;
    if (!file.name.endsWith('.pdf') && !file.name.endsWith('.docx')) {
      setError('Only PDF (.pdf) and Word (.docx) files are supported.');
      return;
    }

    try {
      setUploading(true);
      setError('');
      await uploadDocument(file);
      await loadDocuments();
    } catch (err) {
      setError(err.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (!isAdmin) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDelete = async (docId) => {
    if (!isAdmin) return;
    if (!confirm('Are you sure you want to delete this document and its vector embeddings?')) return;
    try {
      setError('');
      await deleteDocument(docId);
      await loadDocuments();
    } catch (err) {
      setError(err.message || 'Failed to delete document.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="title-icon">📁</span>
            <h2>Knowledge Base Documents</h2>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error && <div className="error-banner">{error}</div>}

          {/* Upload Dropzone (Admin Only) */}
          {isAdmin ? (
            <div
              className={`dropzone ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {uploading ? (
                <div className="upload-spinner-state">
                  <div className="spinner"></div>
                  <p>Extracting, Chunking & Indexing into Vector DB...</p>
                </div>
              ) : (
                <>
                  <span className="upload-icon">☁️</span>
                  <p className="upload-title">Drag & Drop your document here</p>
                  <p className="upload-subtitle">Supports PDF (.pdf) and Word (.docx) up to 20MB</p>
                  <label className="browse-btn">
                    Browse File
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      style={{ display: 'none' }}
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    />
                  </label>
                </>
              )}
            </div>
          ) : (
            <div className="reviewer-notice">
              🔒 <b>Reviewer Access Notice:</b> Document uploading and deletion are restricted to Tenant Admins. Reviewers have read-only access to knowledge base documents.
            </div>
          )}

          {/* Document Inventory */}
          <div className="inventory-header">
            <h3>Uploaded Documents ({documents.length})</h3>
          </div>

          {loading ? (
            <div className="loading-state">Loading document index...</div>
          ) : documents.length === 0 ? (
            <div className="empty-state">No documents uploaded yet. Upload a PDF or DOCX file to enable RAG.</div>
          ) : (
            <div className="doc-list">
              {documents.map((doc) => (
                <div className="doc-card" key={doc.id}>
                  <div className="doc-icon">📄</div>
                  <div className="doc-info">
                    <div className="doc-filename">{doc.filename}</div>
                    <div className="doc-meta">
                      <span className={`status-tag status-${doc.status}`}>
                        {doc.status === 'ready' ? '✅ Ready' : doc.status === 'failed' ? '❌ Failed' : '⏳ Processing'}
                      </span>
                      {doc.chunk_count > 0 && <span className="chunks-tag">{doc.chunk_count} vector chunks</span>}
                      <span className="date-tag">{new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <button className="delete-btn" title="Delete Document" onClick={() => handleDelete(doc.id)}>
                      🗑️
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .modal-container {
          background: #ffffff;
          border-radius: 16px;
          width: 100%;
          max-width: 680px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #f1f5f9;
        }

        .modal-title {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .title-icon {
          font-size: 1.3rem;
        }

        .modal-title h2 {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 700;
          color: #0f172a;
        }

        .close-btn {
          background: #f1f5f9;
          border: none;
          color: #64748b;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: #e2e8f0;
          color: #0f172a;
        }

        .modal-body {
          padding: 1.5rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .error-banner {
          background: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          font-size: 0.875rem;
        }

        .reviewer-notice {
          background: #fefce8;
          color: #854d0e;
          border: 1px solid #fef08a;
          padding: 0.85rem 1rem;
          border-radius: 8px;
          font-size: 0.85rem;
          line-height: 1.45;
        }

        .dropzone {
          border: 2px dashed #cbd5e1;
          border-radius: 12px;
          padding: 2rem 1.5rem;
          text-align: center;
          background: #f8fafc;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .dropzone.drag-over {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .upload-icon {
          font-size: 2.25rem;
          margin-bottom: 0.5rem;
        }

        .upload-title {
          font-weight: 600;
          color: #1e293b;
          margin: 0 0 0.25rem 0;
        }

        .upload-subtitle {
          font-size: 0.8rem;
          color: #64748b;
          margin: 0 0 1rem 0;
        }

        .browse-btn {
          background: #2563eb;
          color: #ffffff;
          padding: 0.55rem 1.25rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .browse-btn:hover {
          background: #1d4ed8;
        }

        .upload-spinner-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          color: #2563eb;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #dbeafe;
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .inventory-header h3 {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 700;
          color: #334155;
        }

        .doc-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .doc-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.85rem 1rem;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          transition: border-color 0.2s;
        }

        .doc-card:hover {
          border-color: #cbd5e1;
        }

        .doc-icon {
          font-size: 1.5rem;
        }

        .doc-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .doc-filename {
          font-weight: 600;
          font-size: 0.9rem;
          color: #0f172a;
          word-break: break-all;
        }

        .doc-meta {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.775rem;
        }

        .status-tag {
          padding: 0.15rem 0.45rem;
          border-radius: 4px;
          font-weight: 600;
        }

        .status-ready {
          background: #f0fdf4;
          color: #166534;
        }

        .status-failed {
          background: #fef2f2;
          color: #991b1b;
        }

        .chunks-tag {
          background: #eff6ff;
          color: #1e40af;
          padding: 0.15rem 0.45rem;
          border-radius: 4px;
          font-weight: 500;
        }

        .date-tag {
          color: #94a3b8;
        }

        .delete-btn {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 0.4rem 0.6rem;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.9rem;
        }

        .delete-btn:hover {
          background: #fee2e2;
          border-color: #fca5a5;
        }

        .empty-state, .loading-state {
          text-align: center;
          padding: 1.5rem;
          color: #64748b;
          font-size: 0.875rem;
          background: #f8fafc;
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
}
