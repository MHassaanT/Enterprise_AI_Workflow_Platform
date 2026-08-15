'use client';
import { useState, useEffect } from 'react';
import { fetchDocuments, uploadDocument, uploadLink, deleteDocument, getUser } from '@/lib/api';

export default function DocumentModal({ isOpen, onClose }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [user, setUser] = useState(null);
  const [uploadMode, setUploadMode] = useState('file'); // 'file' | 'link'
  const [linkUrl, setLinkUrl] = useState('');

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
    const name = file.name.toLowerCase();
    const isSupported = name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.md') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp');
    if (!isSupported) {
      setError('Unsupported format. Allowed: PDF, DOCX, MD, PNG, JPG, WEBP.');
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

  const handleLinkUpload = async () => {
    if (!isAdmin) return;
    if (!linkUrl.trim()) return;
    
    try {
      setUploading(true);
      setError('');
      await uploadLink(linkUrl.trim());
      setLinkUrl('');
      await loadDocuments();
    } catch (err) {
      setError(err.message || 'Failed to ingest link.');
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
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-md z-50" onClick={onClose}>
      <div className="bg-surface-container-low border border-outline-variant rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-lg bg-surface border-b border-outline-variant flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📁</span>
            <h2 className="font-headline-md text-headline-md text-on-surface">Knowledge Base Documents</h2>
          </div>
          <button className="text-on-surface-variant hover:text-on-surface text-xl p-1 rounded-md hover:bg-surface-container transition-colors" onClick={onClose}>✕</button>
        </div>

        <div className="p-xl overflow-y-auto space-y-lg">
          {error && <div className="p-md rounded-lg bg-error-container/20 text-error border border-error/30 font-body-md">{error}</div>}

          {/* Upload Section (Admin Only) */}
          {isAdmin ? (
            <div className="border border-outline-variant rounded-xl overflow-hidden bg-surface">
              <div className="flex border-b border-outline-variant">
                <button 
                  className={`flex-1 py-md font-label-md font-semibold ${uploadMode === 'file' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-container'}`}
                  onClick={() => setUploadMode('file')}
                >
                  Upload File
                </button>
                <button 
                  className={`flex-1 py-md font-label-md font-semibold ${uploadMode === 'link' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-container'}`}
                  onClick={() => setUploadMode('link')}
                >
                  Add via Link
                </button>
              </div>

              {uploadMode === 'file' && (
                <div
                  className={`p-xl text-center flex flex-col items-center justify-center transition-colors ${dragOver ? 'bg-primary-container/10' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-md text-primary font-semibold">
                      <div className="w-8 h-8 border-4 border-outline-variant border-t-primary rounded-full animate-spin"></div>
                      <p className="font-body-md">Extracting, Chunking & Indexing into Vector DB...</p>
                    </div>
                  ) : (
                    <>
                      <span className="text-4xl mb-2">☁️</span>
                      <p className="font-headline-md text-headline-md text-on-surface mb-1">Drag & Drop your document here</p>
                      <p className="font-body-md text-body-md text-on-surface-variant mb-md">Supports PDF, DOCX, MD, and Images (up to 20MB)</p>
                      <label className="px-lg py-md bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors cursor-pointer shadow-sm">
                        Browse File
                        <input
                          type="file"
                          accept=".pdf,.docx,.md,.png,.jpg,.jpeg,.webp"
                          style={{ display: 'none' }}
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}

              {uploadMode === 'link' && (
                <div className="p-xl flex flex-col items-center justify-center">
                  {uploading ? (
                    <div className="flex flex-col items-center gap-md text-primary font-semibold">
                      <div className="w-8 h-8 border-4 border-outline-variant border-t-primary rounded-full animate-spin"></div>
                      <p className="font-body-md">Scraping URL, Chunking & Indexing...</p>
                    </div>
                  ) : (
                    <div className="w-full space-y-md">
                      <p className="font-body-md text-on-surface-variant text-center">
                        Provide a public website URL. We will scrape its contents and index it into the Knowledge Base.
                      </p>
                      <div className="flex gap-md">
                        <input 
                          type="url" 
                          placeholder="https://example.com"
                          className="flex-1 bg-surface-container p-md rounded-lg border border-outline focus:border-primary outline-none text-on-surface"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                        />
                        <button 
                          onClick={handleLinkUpload}
                          disabled={!linkUrl.trim()}
                          className="px-lg py-md bg-primary text-on-primary font-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Ingest
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-md rounded-lg bg-tertiary-container/10 border border-tertiary/20 text-tertiary font-body-md">
              🔒 <b>Reviewer Access Notice:</b> Document uploading and deletion are restricted to Tenant Admins. Reviewers have read-only access to knowledge base documents.
            </div>
          )}

          {/* Document Inventory */}
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Uploaded Documents ({documents.length})</h3>
          </div>

          {loading ? (
            <div className="p-xl text-center text-on-surface-variant bg-surface border border-dashed border-outline-variant rounded-lg">Loading document index...</div>
          ) : documents.length === 0 ? (
            <div className="p-xl text-center text-on-surface-variant bg-surface border border-dashed border-outline-variant rounded-lg">No documents uploaded yet. Upload a file or URL to enable RAG.</div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div className="bg-surface border border-outline-variant rounded-lg p-md flex items-center justify-between hover:border-outline transition-colors" key={doc.id}>
                  <div className="flex items-center gap-md">
                    <span className="text-2xl">{doc.filename.startsWith('http') ? '🌐' : doc.filename.endsWith('.md') ? '📝' : doc.filename.match(/\.(png|jpe?g|webp)$/i) ? '🖼️' : '📄'}</span>
                    <div className="space-y-1">
                      <div className="font-body-md text-on-surface font-semibold break-all">{doc.filename}</div>
                      <div className="flex items-center gap-md font-label-md text-label-md">
                        <span className={`px-2 py-0.5 rounded font-mono ${doc.status === 'ready' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/50' : doc.status === 'failed' ? 'bg-error-container/20 text-error border border-error/30' : 'bg-tertiary-container/20 text-tertiary border border-tertiary/30'}`}>
                          {doc.status === 'ready' ? '✅ Ready' : doc.status === 'failed' ? '❌ Failed' : '⏳ Processing'}
                        </span>
                        {doc.chunk_count > 0 && <span className="text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant font-mono">{doc.chunk_count} vector chunks</span>}
                        <span className="text-on-surface-variant">{new Date(doc.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <button className="px-3 py-1.5 bg-error-container/20 text-error border border-error/30 rounded-md font-label-md text-label-md hover:bg-error-container/40 transition-colors" title="Delete Document" onClick={() => handleDelete(doc.id)}>
                      🗑️
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
