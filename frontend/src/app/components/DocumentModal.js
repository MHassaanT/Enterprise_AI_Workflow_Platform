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
          background: rgba(17, 24, 39, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .modal-container {
          background: var(--color-surface);
          border-radius: var(--radius-lg);
          border: 1px solid var(--color-border);
          width: 100%;
          max-width: 680px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-modal);
          overflow: hidden;
          animation: modalSlide 0.2s ease-out;
        }

        @keyframes modalSlide {
          from { transform: translateY(10px) scale(0.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem 2rem;
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg);
        }

        .modal-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .title-icon {
          font-size: 1.5rem;
        }

        .modal-title h2 {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--color-text);
        }

        .close-btn {
          background: transparent;
          border: none;
          color: var(--color-muted);
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          font-size: 1.25rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          background: var(--color-secondary);
          color: var(--color-text);
        }

        .modal-body {
          padding: 2rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .error-banner {
          background: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
          padding: 0.75rem 1rem;
          border-radius: var(--radius);
          font-size: 0.875rem;
        }

        .reviewer-notice {
          background: #fefce8;
          color: #854d0e;
          border: 1px solid #fef08a;
          padding: 1rem;
          border-radius: var(--radius);
          font-size: 0.85rem;
          line-height: 1.5;
        }

        .dropzone {
          border: 2px dashed var(--color-border);
          border-radius: var(--radius-lg);
          padding: 2.5rem 2rem;
          text-align: center;
          background: var(--color-bg);
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .dropzone.drag-over {
          border-color: var(--color-accent);
          background: #eff6ff;
        }

        .upload-icon {
          font-size: 2.25rem;
          margin-bottom: 0.5rem;
        }

        .upload-title {
          font-weight: 600;
          color: var(--color-text);
          margin: 0 0 0.25rem 0;
        }

        .upload-subtitle {
          font-size: 0.85rem;
          color: var(--color-muted);
          margin: 0 0 1.25rem 0;
        }

        .browse-btn {
          background: var(--color-primary);
          color: #ffffff;
          padding: 0.65rem 1.25rem;
          border-radius: var(--radius);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: var(--shadow-sm);
        }

        .browse-btn:hover {
          background: var(--color-primary-hover);
          box-shadow: var(--shadow-md);
          transform: translateY(-1px);
        }

        .upload-spinner-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          color: var(--color-primary);
          font-weight: 600;
          font-size: 0.9rem;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e5e7eb;
          border-top-color: var(--color-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .inventory-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: var(--color-text);
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
          padding: 1rem 1.25rem;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .doc-card:hover {
          border-color: #d1d5db;
          box-shadow: var(--shadow-sm);
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
          color: var(--color-text);
          word-break: break-all;
        }

        .doc-meta {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.8rem;
        }

        .status-tag {
          padding: 0.15rem 0.5rem;
          border-radius: var(--radius-sm);
          font-weight: 600;
          font-size: 0.75rem;
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
          background: #f3f4f6;
          color: #1f2937;
          padding: 0.15rem 0.5rem;
          border-radius: var(--radius-sm);
          font-weight: 500;
        }

        .date-tag {
          color: var(--color-muted);
        }

        .delete-btn {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: 0.4rem 0.6rem;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.9rem;
        }

        .delete-btn:hover {
          background: #fef2f2;
          border-color: #fca5a5;
        }

        .empty-state, .loading-state {
          text-align: center;
          padding: 2rem;
          color: var(--color-muted);
          font-size: 0.9rem;
          background: var(--color-bg);
          border-radius: var(--radius-lg);
          border: 1px dashed var(--color-border);
        }
      `}</style>
    </div>
  );
}
