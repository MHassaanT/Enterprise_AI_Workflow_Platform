'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../components/AuthGuard';
import { fetchWorkflows, createWorkflow } from '@/lib/api';

export default function WorkflowsListPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [workflows, setWorkflows] = useState([]);

  useEffect(() => {
    fetchWorkflows().then(setWorkflows).catch(console.error);
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!workflowName) return;
    
    try {
      const newWorkflow = await createWorkflow(workflowName, workflowDescription);
      router.push(`/admin/workflows/${newWorkflow.id}`);
    } catch (err) {
      console.error(err);
      alert('Failed to create workflow');
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md antialiased">
        <main className="max-w-container-max mx-auto px-lg py-xl">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="font-display-sm text-display-sm font-extrabold text-on-surface mb-2 tracking-tight">Workflows</h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">Manage and build automated processes across all tenants</p>
            </div>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-2 rounded-lg font-bold text-on-primary bg-primary hover:bg-primary/90 transition-colors shadow-sm"
            >
              + Create Workflow
            </button>
          </div>

          {/* Workflows List Table */}
          <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-outline-variant">
              <thead className="bg-surface-container-lowest">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Last Updated</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-on-surface-variant uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-outline-variant">
                {workflows.map((wf) => (
                  <tr key={wf.id} className="hover:bg-surface-container transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-primary hover:underline">
                        <Link href={`/admin/workflows/${wf.id}`}>{wf.name}</Link>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-bold rounded-full ${
                        wf.status === 'active' ? 'bg-primary-container text-primary border border-primary/30' : 'bg-surface-container-high text-on-surface-variant border border-outline'
                      }`}>
                        {wf.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-on-surface-variant">
                      {new Date(wf.updated_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold">
                      <Link href={`/admin/workflows/${wf.id}`} className="text-primary hover:text-primary/80">Edit</Link>
                    </td>
                  </tr>
                ))}
                {workflows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-on-surface-variant text-sm">
                      <div className="flex flex-col items-center justify-center">
                        <span className="material-symbols-outlined text-4xl mb-2 text-outline">account_tree</span>
                        <p>No workflows found for this tenant. Create one to get started.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Create Modal */}
          {isModalOpen && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
              <div className="bg-surface border border-outline-variant rounded-xl shadow-lg max-w-md w-full p-6">
                <h2 className="text-xl font-bold text-on-surface mb-4">Create New Workflow</h2>
                <form onSubmit={handleCreate}>
                  <div className="mb-4">
                    <label className="block text-sm font-bold text-on-surface-variant mb-1">Workflow Name</label>
                    <input
                      type="text"
                      required
                      className="w-full border border-outline rounded-lg px-3 py-2 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                      value={workflowName}
                      onChange={e => setWorkflowName(e.target.value)}
                      placeholder="e.g. Employee Onboarding"
                    />
                  </div>
                  <div className="mb-6">
                    <label className="block text-sm font-bold text-on-surface-variant mb-1">Description (Optional)</label>
                    <textarea
                      className="w-full border border-outline rounded-lg px-3 py-2 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                      rows={3}
                      value={workflowDescription}
                      onChange={e => setWorkflowDescription(e.target.value)}
                      placeholder="Briefly describe what this workflow does"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 text-on-surface-variant bg-surface-container hover:bg-surface-container-high rounded-lg font-bold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary/90 transition-colors"
                    >
                      Create & Edit
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
