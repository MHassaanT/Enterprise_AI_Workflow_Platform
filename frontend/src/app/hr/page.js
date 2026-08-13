'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';
import {
  createJobDescription,
  fetchJobDescriptions,
  fetchJobDescription,
  uploadResumes,
  rankCandidates,
  scheduleInterview,
  deleteJobDescription
} from '@/lib/api';

export default function HRAgentPage() {
  const [jds, setJds] = useState([]);
  const [activeJdId, setActiveJdId] = useState(null);
  const [activeJd, setActiveJd] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);

  // New JD Form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newReq, setNewReq] = useState('');

  // Upload
  const [files, setFiles] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Ranking
  const [ranking, setRanking] = useState(false);

  // Interview Modal
  const [showModal, setShowModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [interviewDetails, setInterviewDetails] = useState('');
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    loadJDs();
  }, []);

  const loadJDs = async () => {
    try {
      setLoading(true);
      const data = await fetchJobDescriptions();
      setJds(data);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadJDDetails = async (id) => {
    try {
      setActiveJdId(id);
      const data = await fetchJobDescription(id);
      setActiveJd(data.jobDescription);
      setResumes(data.resumes || []);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleCreateJD = async (e) => {
    e.preventDefault();
    try {
      const created = await createJobDescription(newTitle, newDesc, newReq);
      setNewTitle('');
      setNewDesc('');
      setNewReq('');
      await loadJDs();
      loadJDDetails(created.id);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!files || files.length === 0) return;
    try {
      setUploading(true);
      await uploadResumes(activeJdId, files);
      setFiles(null);
      alert('Resumes uploaded successfully and are processing.');
      // Polling or just reload after a bit. Let's just reload.
      setTimeout(() => loadJDDetails(activeJdId), 2000);
    } catch (e) {
      alert(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRank = async () => {
    try {
      setRanking(true);
      const ranked = await rankCandidates(activeJdId);
      setResumes(ranked);
    } catch (e) {
      alert(e.message);
    } finally {
      setRanking(false);
    }
  };

  const handleDeleteJD = async (id) => {
    if (!confirm('Are you sure you want to delete this job description and all its resumes?')) return;
    try {
      await deleteJobDescription(id);
      if (activeJdId === id) {
        setActiveJdId(null);
        setActiveJd(null);
        setResumes([]);
      }
      loadJDs();
    } catch (e) {
      alert(e.message);
    }
  };

  const toggleSelection = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSchedule = async () => {
    if (!interviewDetails) return alert('Please enter interview details.');
    try {
      setScheduling(true);
      await scheduleInterview(selectedIds, interviewDetails);
      setShowModal(false);
      setInterviewDetails('');
      setSelectedIds([]);
      alert('Interview emails sent successfully.');
      loadJDDetails(activeJdId);
    } catch (e) {
      alert(e.message);
    } finally {
      setScheduling(false);
    }
  };

  const renderRankBar = (score) => {
    if (score == null) return null;
    const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-400' : 'bg-red-500';
    return (
      <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden mt-1">
        <div className={`${color} h-full transition-all duration-1000`} style={{ width: `${score}%` }}></div>
      </div>
    );
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md antialiased flex flex-col">
        <header className="border-b border-outline-variant bg-surface px-lg py-md flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-on-surface-variant hover:text-primary transition-colors flex items-center">
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-primary">groups</span>
              </div>
              <div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight">HR Agent</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">Candidate Screening & Scheduling</p>
              </div>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-80 border-r border-outline-variant bg-surface-container-low flex flex-col">
            <div className="p-4 border-b border-outline-variant">
              <button 
                onClick={() => { setActiveJdId(null); setActiveJd(null); }}
                className="w-full py-2 px-4 bg-primary text-on-primary rounded font-label-md font-semibold hover:bg-primary-container transition-colors"
              >
                + New Job Description
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading && !jds.length && <p className="text-sm text-on-surface-variant text-center">Loading...</p>}
              {jds.map(jd => (
                <div 
                  key={jd.id} 
                  className={`p-3 rounded-lg border cursor-pointer group flex justify-between items-start transition-colors ${activeJdId === jd.id ? 'bg-primary-container/20 border-primary/50' : 'bg-surface border-outline-variant hover:border-outline'}`}
                  onClick={() => loadJDDetails(jd.id)}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-label-md text-on-surface truncate">{jd.title}</h3>
                    <p className="text-xs text-on-surface-variant mt-1">{new Date(jd.created_at).toLocaleDateString()}</p>
                    <span className="inline-block mt-2 text-[10px] bg-surface-container px-2 py-0.5 rounded border border-outline-variant">
                      {jd.resume_count || 0} Resumes
                    </span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteJD(jd.id); }}
                    className="text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity p-1"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto bg-background p-xl">
            {!activeJdId ? (
              <div className="max-w-3xl mx-auto">
                <h2 className="font-headline-md mb-6">Create New Job Description</h2>
                <form onSubmit={handleCreateJD} className="space-y-6">
                  <div>
                    <label className="block font-label-md text-on-surface mb-2">Job Title</label>
                    <input 
                      type="text" 
                      required
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-md px-4 py-2 text-on-surface focus:outline-none focus:border-primary"
                      placeholder="e.g. Senior Python Developer"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-on-surface mb-2">Full Description</label>
                    <textarea 
                      required
                      value={newDesc}
                      onChange={e => setNewDesc(e.target.value)}
                      rows={6}
                      className="w-full bg-surface border border-outline-variant rounded-md px-4 py-2 text-on-surface focus:outline-none focus:border-primary resize-none"
                      placeholder="Paste the full job description here..."
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-on-surface mb-2">Key Requirements (Optional)</label>
                    <textarea 
                      value={newReq}
                      onChange={e => setNewReq(e.target.value)}
                      rows={3}
                      className="w-full bg-surface border border-outline-variant rounded-md px-4 py-2 text-on-surface focus:outline-none focus:border-primary resize-none"
                      placeholder="Specific skills or qualifications to prioritize..."
                    />
                  </div>
                  <button type="submit" className="px-6 py-2 bg-primary text-on-primary rounded font-label-md hover:bg-primary-container transition-colors">
                    Create & Continue
                  </button>
                </form>
              </div>
            ) : (
              <div className="max-w-5xl mx-auto space-y-xl">
                {/* JD Header */}
                <div className="bg-surface border border-outline-variant rounded-xl p-lg">
                  <h2 className="font-headline-md mb-2">{activeJd?.title}</h2>
                  <p className="text-sm text-on-surface-variant mb-4 line-clamp-2">{activeJd?.description}</p>
                </div>

                {/* Upload Section */}
                <div className="bg-surface border border-outline-variant rounded-xl p-lg">
                  <h3 className="font-headline-sm mb-4">Upload Resumes</h3>
                  <form onSubmit={handleUpload} className="flex gap-4 items-center">
                    <input 
                      type="file" 
                      multiple 
                      accept=".pdf,.docx"
                      onChange={e => setFiles(e.target.files)}
                      className="flex-1 bg-surface-container border border-outline-variant border-dashed rounded-md p-4 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-on-primary hover:file:bg-primary-container cursor-pointer"
                    />
                    <button 
                      type="submit" 
                      disabled={!files || files.length === 0 || uploading}
                      className="px-6 py-4 bg-primary text-on-primary rounded font-label-md hover:bg-primary-container transition-colors disabled:opacity-50 h-full whitespace-nowrap"
                    >
                      {uploading ? 'Uploading...' : 'Upload Files'}
                    </button>
                  </form>
                </div>

                {/* Candidates List */}
                <div className="bg-surface border border-outline-variant rounded-xl p-lg overflow-hidden">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-headline-sm">Candidates</h3>
                    <div className="flex gap-3">
                      <button 
                        onClick={handleRank}
                        disabled={ranking || resumes.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-secondary text-on-secondary rounded font-label-md hover:opacity-90 disabled:opacity-50 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">magic_button</span>
                        {ranking ? 'Ranking...' : 'Rank Candidates'}
                      </button>
                      <button 
                        onClick={() => setShowModal(true)}
                        disabled={selectedIds.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded font-label-md hover:bg-primary-container disabled:opacity-50 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">event</span>
                        Schedule ({selectedIds.length})
                      </button>
                    </div>
                  </div>

                  {resumes.length === 0 ? (
                    <div className="text-center py-12 text-on-surface-variant bg-surface-container-low rounded-lg border border-outline-variant border-dashed">
                      No resumes uploaded yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-outline-variant text-on-surface-variant font-label-sm uppercase tracking-wider">
                            <th className="p-3 w-10"></th>
                            <th className="p-3">Candidate</th>
                            <th className="p-3 w-40">Score</th>
                            <th className="p-3 w-64">Matched Skills</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="align-top text-sm">
                          {resumes.map(r => (
                            <tr key={r.id} className="border-b border-outline-variant/50 hover:bg-surface-container-low transition-colors">
                              <td className="p-3 pt-4">
                                <input 
                                  type="checkbox" 
                                  checked={selectedIds.includes(r.id)}
                                  onChange={() => toggleSelection(r.id)}
                                  className="accent-primary w-4 h-4 rounded border-outline-variant"
                                />
                              </td>
                              <td className="p-3">
                                <div className="font-medium text-on-surface mb-1">{r.candidate_name || r.filename}</div>
                                <div className="text-on-surface-variant text-xs">{r.candidate_email || 'No email found'}</div>
                                {r.rank_reasoning && (
                                  <div className="mt-2 text-xs text-on-surface-variant italic bg-surface-container p-2 rounded line-clamp-2">
                                    "{r.rank_reasoning}"
                                  </div>
                                )}
                              </td>
                              <td className="p-3 pt-4">
                                {r.rank_score != null ? (
                                  <div>
                                    <div className="font-mono font-bold text-on-surface flex items-center justify-between">
                                      {r.rank_score}/100
                                    </div>
                                    {renderRankBar(r.rank_score)}
                                  </div>
                                ) : (
                                  <span className="text-on-surface-variant text-xs">{r.status}</span>
                                )}
                              </td>
                              <td className="p-3 pt-4">
                                <div className="flex flex-wrap gap-1">
                                  {r.skills_matched && Array.isArray(r.skills_matched) ? r.skills_matched.slice(0,5).map((s,i) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 bg-secondary-container/50 text-on-surface rounded border border-outline-variant">
                                      {s}
                                    </span>
                                  )) : <span className="text-on-surface-variant text-xs">-</span>}
                                  {r.skills_matched && Array.isArray(r.skills_matched) && r.skills_matched.length > 5 && (
                                    <span className="text-[10px] px-2 py-0.5 text-on-surface-variant">+{r.skills_matched.length - 5}</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 pt-4">
                                {r.email_status === 'sent' ? (
                                  <span className="text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded text-xs flex items-center gap-1 w-max">
                                    <span className="material-symbols-outlined text-[14px]">check_circle</span> Invited
                                  </span>
                                ) : r.email_status === 'failed' ? (
                                  <span className="text-error bg-error/10 px-2 py-1 rounded text-xs flex items-center gap-1 w-max" title={r.error_message}>
                                    <span className="material-symbols-outlined text-[14px]">error</span> Failed
                                  </span>
                                ) : (
                                  <span className="text-on-surface-variant text-xs">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Schedule Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-surface border border-outline-variant rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                <h3 className="font-headline-sm text-on-surface">Schedule Interviews ({selectedIds.length} candidates)</h3>
                <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6">
                <p className="text-sm text-on-surface-variant mb-4">
                  The AI agent will automatically draft and send personalized emails to the selected candidates via Gmail.
                </p>
                <div className="mb-4">
                  <label className="block font-label-md text-on-surface mb-2">Interview Details (Date, Time, Location/Link)</label>
                  <textarea
                    value={interviewDetails}
                    onChange={e => setInterviewDetails(e.target.value)}
                    rows={4}
                    className="w-full bg-surface-container border border-outline-variant rounded-md p-3 text-on-surface focus:outline-none focus:border-primary text-sm resize-none"
                    placeholder="e.g. We would like to invite you to a 30-minute Google Meet interview on Thursday, Oct 12th at 2:00 PM EST..."
                  ></textarea>
                </div>
                <div className="bg-surface-container-low border border-outline-variant rounded p-3 text-xs text-on-surface-variant flex gap-2">
                  <span className="material-symbols-outlined text-[16px] text-tertiary">info</span>
                  Make sure you have connected your Gmail account via the MCP Integrations page.
                </div>
              </div>
              <div className="px-6 py-4 border-t border-outline-variant flex justify-end gap-3 bg-surface-container-low">
                <button 
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 font-label-md text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSchedule}
                  disabled={scheduling || !interviewDetails}
                  className="px-6 py-2 bg-primary text-on-primary rounded font-label-md hover:bg-primary-container disabled:opacity-50 flex items-center gap-2 transition-colors"
                >
                  {scheduling ? 'Sending...' : 'Draft & Send Emails'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
