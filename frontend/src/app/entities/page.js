'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';


const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('token') : null;
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

const FIELD_TYPES = ['string','number','boolean','enum','date','datetime','reference','json','email','url'];
const OPERATIONS = ['search','get_by_id','create','update','delete','count'];
const TONES = ['professional','friendly','technical','casual'];
const ICONS = ['box','inventory','shopping_cart','home','apartment','local_hospital','school','work','person','receipt_long','calendar_month','task','support_agent'];

export default function EntitiesPage() {
  const router = useRouter();
  const [tab, setTab] = useState('entities');
  const [entities, setEntities] = useState([]);
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewEntity, setShowNewEntity] = useState(false);
  const [newEntity, setNewEntity] = useState({ entity_name:'', display_name:'', description:'', icon:'box', data_source_type:'internal_api', data_source_config:{} });
  const [expandedEntity, setExpandedEntity] = useState(null);
  const [newField, setNewField] = useState({ field_name:'', display_name:'', field_type:'string', is_required:false, is_searchable:true, description:'' });
  const [showFieldForm, setShowFieldForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [magicPrompt, setMagicPrompt] = useState('');
  const [isMagicGenerating, setIsMagicGenerating] = useState(false);

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const fetchEntities = async () => {
    try {
      const res = await fetch(`${API}/api/entities`, { headers: headers() });
      if (res.ok) { 
        const d = await res.json(); 
        const loadedEntities = d.entities || [];
        setEntities(loadedEntities);
        if (loadedEntities.length === 0 && !localStorage.getItem('entity_onboarding_seen')) {
          setShowOnboardingModal(true);
          localStorage.setItem('entity_onboarding_seen', 'true');
        }
      }
    } catch(e) { console.error(e); }
  };
  const fetchContext = async () => {
    try {
      const res = await fetch(`${API}/api/entities/agent-context`, { headers: headers() });
      if (res.ok) { const d = await res.json(); setContext(d.context||{ company_name:'', company_description:'', support_tone:'professional', auto_escalate_keywords:[], custom_system_instructions:'', max_tool_calls_per_turn:5 }); }
    } catch(e) { console.error(e); }
  };

  useEffect(() => { Promise.all([fetchEntities(), fetchContext()]).then(()=>setLoading(false)); }, []);

  const createEntity = async () => {
    if (!newEntity.entity_name || !newEntity.display_name) return showToast('Name required','error');
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/entities`, { method:'POST', headers:headers(), body:JSON.stringify(newEntity) });
      if (res.ok) { showToast('Entity created'); setShowNewEntity(false); setNewEntity({entity_name:'',display_name:'',description:'',icon:'box',data_source_type:'internal_api',data_source_config:{}}); fetchEntities(); }
      else { const e = await res.json(); showToast(e.error||'Failed','error'); }
    } catch(e) { showToast('Error','error'); } finally { setSaving(false); }
  };

  const deleteEntity = async (id) => {
    if (!confirm('Delete this entity and all its fields/operations?')) return;
    try {
      const res = await fetch(`${API}/api/entities/${id}`, { method:'DELETE', headers:headers() });
      if (res.ok) { showToast('Entity deleted'); fetchEntities(); }
    } catch(e) { showToast('Error','error'); }
  };

  const addField = async (entityId) => {
    if (!newField.field_name || !newField.display_name) return showToast('Field name required','error');
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/entities/${entityId}/fields`, { method:'POST', headers:headers(), body:JSON.stringify(newField) });
      if (res.ok) { showToast('Field added'); setShowFieldForm(null); setNewField({field_name:'',display_name:'',field_type:'string',is_required:false,is_searchable:true,description:''}); fetchEntities(); }
      else { const e = await res.json(); showToast(e.error||'Failed','error'); }
    } catch(e) { showToast('Error','error'); } finally { setSaving(false); }
  };

  const deleteField = async (entityId, fieldId) => {
    try {
      const res = await fetch(`${API}/api/entities/${entityId}/fields/${fieldId}`, { method:'DELETE', headers:headers() });
      if (res.ok) { showToast('Field removed'); fetchEntities(); }
    } catch(e) { showToast('Error','error'); }
  };

  const addOperation = async (entityId, opName) => {
    try {
      const res = await fetch(`${API}/api/entities/${entityId}/operations`, { method:'POST', headers:headers(), body:JSON.stringify({operation_name:opName}) });
      if (res.ok) { showToast(`Operation '${opName}' added`); fetchEntities(); }
      else { const e = await res.json(); showToast(e.error||'Failed','error'); }
    } catch(e) { showToast('Error','error'); }
  };

  const deleteOperation = async (entityId, opId) => {
    try {
      const res = await fetch(`${API}/api/entities/${entityId}/operations/${opId}`, { method:'DELETE', headers:headers() });
      if (res.ok) { showToast('Operation removed'); fetchEntities(); }
    } catch(e) { showToast('Error','error'); }
  };

  const saveContext = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/entities/agent-context`, { method:'PUT', headers:headers(), body:JSON.stringify(context) });
      if (res.ok) { showToast('Agent context saved'); fetchContext(); }
      else showToast('Failed to save','error');
    } catch(e) { showToast('Error','error'); } finally { setSaving(false); }
  };

  const autoGenerateEntities = async () => {
    setIsAutoGenerating(true);
    try {
      const res = await fetch(`${API}/api/entities/auto-generate`, { method: 'POST', headers: headers() });
      if (res.ok) {
        showToast('Entities auto-generated successfully!');
        fetchEntities();
        setShowOnboardingModal(false);
      } else {
        const e = await res.json();
        showToast(e.error || 'Failed to auto-generate', 'error');
      }
    } catch (e) {
      showToast('Error', 'error');
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const magicGenerateEntity = async () => {
    if (!magicPrompt.trim()) return showToast('Please enter a description', 'error');
    setIsMagicGenerating(true);
    try {
      const res = await fetch(`${API}/api/entities/generate`, { method: 'POST', headers: headers(), body: JSON.stringify({ prompt: magicPrompt }) });
      if (res.ok) {
        showToast('Entity generated successfully!');
        setMagicPrompt('');
        fetchEntities();
      } else {
        const e = await res.json();
        showToast(e.error || 'Failed to generate', 'error');
      }
    } catch (e) {
      showToast('Error', 'error');
    } finally {
      setIsMagicGenerating(false);
    }
  };

  const approveEntity = async (entityId) => {
    try {
      const res = await fetch(`${API}/api/entities/${entityId}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ status: 'active' }) });
      if (res.ok) {
        showToast('Entity approved and activated!');
        fetchEntities();
      }
    } catch (e) {
      showToast('Error', 'error');
    }
  };

  const tabs = [
    { id:'entities', label:'Entities', icon:'database' },
    { id:'context', label:'Agent Context', icon:'smart_toy' },
    { id:'integrations', label:'Integrations', icon:'hub' },
  ];

  return (
    <>
      <main style={{ flex:1, padding:'32px', maxWidth:1200, margin:'0 auto', width:'100%' }}>
        {/* Header */}
          <div style={{ marginBottom:32 }}>
            <h1 style={{ fontSize:28, fontWeight:800, color:'#f0f0f0', marginBottom:6, fontFamily:'Inter,sans-serif' }}>Entity Schema Builder</h1>
            <p style={{ color:'#9ca3af', fontSize:14 }}>Configure business entities, fields, and agent behavior for your tenant.</p>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:28, background:'rgba(255,255,255,0.03)', borderRadius:12, padding:4, border:'1px solid rgba(255,255,255,0.06)' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1, padding:'10px 16px', borderRadius:10, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize:14, fontWeight:600, fontFamily:'Inter,sans-serif', transition:'all 0.2s', background: tab===t.id ? 'rgba(59,130,246,0.15)' : 'transparent', color: tab===t.id ? '#60a5fa' : '#9ca3af', borderBottom: tab===t.id ? '2px solid #3b82f6' : '2px solid transparent' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Toast */}
          {toast && (
            <div style={{ position:'fixed', top:24, right:24, padding:'12px 20px', borderRadius:10, background: toast.type==='error' ? 'rgba(239,68,68,0.9)' : 'rgba(34,197,94,0.9)', color:'#fff', fontSize:14, fontWeight:600, zIndex:1000, backdropFilter:'blur(8px)', animation:'slideUp 0.3s ease' }}>
              {toast.msg}
            </div>
          )}

          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:80 }}>
              <div style={{ width:36, height:36, border:'3px solid rgba(59,130,246,0.2)', borderTopColor:'#3b82f6', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <>
              {/* ONBOARDING MODAL */}
              {showOnboardingModal && (
                <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}>
                  <div style={{ background:'#0f172a', border:'1px solid rgba(59,130,246,0.3)', borderRadius:16, padding:32, maxWidth:480, textAlign:'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:48, color:'#60a5fa', marginBottom:16 }}>auto_awesome</span>
                    <h2 style={{ fontSize:22, fontWeight:800, color:'#f0f0f0', marginBottom:12 }}>AI Entity Generation</h2>
                    <p style={{ color:'#9ca3af', fontSize:14, marginBottom:24, lineHeight:1.5 }}>
                      We noticed you don't have any entities configured yet. Would you like our AI to automatically draft your core business entities based on your company's industry and description?
                    </p>
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      <button onClick={() => setShowOnboardingModal(false)} style={{...btnSecondary, padding:'10px 24px'}}>Skip</button>
                      <button onClick={autoGenerateEntities} disabled={isAutoGenerating} style={{...btnPrimary, padding:'10px 24px', display:'flex', alignItems:'center', gap:8}}>
                        {isAutoGenerating ? <span className="material-symbols-outlined" style={{ fontSize:16, animation:'spin 1s linear infinite' }}>refresh</span> : <span className="material-symbols-outlined" style={{ fontSize:16 }}>magic_button</span>}
                        {isAutoGenerating ? 'Generating...' : 'Auto-Generate Entities'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ENTITIES TAB */}
              {tab === 'entities' && (
                <div>
                  {/* MAGIC GENERATE UI */}
                  <div style={{ background:'linear-gradient(to right, rgba(59,130,246,0.1), rgba(168,85,247,0.05))', border:'1px solid rgba(59,130,246,0.2)', borderRadius:14, padding:20, marginBottom:32, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:28, color:'#8b5cf6' }}>auto_awesome</span>
                    <div style={{ flex:1, minWidth:200 }}>
                      <h3 style={{ fontSize:15, fontWeight:700, color:'#e5e7eb', marginBottom:4 }}>Magic Entity Generator</h3>
                      <p style={{ fontSize:12, color:'#9ca3af' }}>Describe the data object you want to track, and AI will build the schema.</p>
                    </div>
                    <div style={{ display:'flex', gap:10, flex:2, minWidth:300 }}>
                      <input value={magicPrompt} onChange={e=>setMagicPrompt(e.target.value)} placeholder="e.g. 'I need to track maintenance requests for properties'" style={{...inputStyle, flex:1, border:'1px solid rgba(139,92,246,0.3)', background:'rgba(0,0,0,0.2)'}} onKeyDown={e => e.key === 'Enter' && magicGenerateEntity()} />
                      <button onClick={magicGenerateEntity} disabled={isMagicGenerating} style={{...btnPrimary, background:'rgba(139,92,246,0.15)', borderColor:'rgba(139,92,246,0.3)', color:'#a78bfa'}}>
                        {isMagicGenerating ? 'Generating...' : 'Generate'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                    <h2 style={{ fontSize:18, fontWeight:700, color:'#e5e7eb' }}>Business Entities ({entities.length})</h2>
                    <button onClick={()=>setShowNewEntity(!showNewEntity)} style={{ padding:'8px 18px', borderRadius:10, border:'1px solid rgba(59,130,246,0.3)', background:'rgba(59,130,246,0.1)', color:'#60a5fa', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6, transition:'all 0.2s' }}>
                      <span className="material-symbols-outlined" style={{ fontSize:16 }}>add</span> New Entity
                    </button>
                  </div>

                  {/* New Entity Form */}
                  {showNewEntity && (
                    <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(59,130,246,0.15)', borderRadius:14, padding:24, marginBottom:24 }}>
                      <h3 style={{ color:'#60a5fa', fontSize:15, fontWeight:700, marginBottom:16 }}>Create New Entity</h3>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                        <div>
                          <label style={labelStyle}>Entity Name (snake_case)</label>
                          <input value={newEntity.entity_name} onChange={e=>setNewEntity({...newEntity, entity_name:e.target.value.toLowerCase().replace(/\s/g,'_')})} placeholder="e.g. listing" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Display Name</label>
                          <input value={newEntity.display_name} onChange={e=>setNewEntity({...newEntity, display_name:e.target.value})} placeholder="e.g. Property Listing" style={inputStyle} />
                        </div>
                        <div style={{ gridColumn:'1/-1' }}>
                          <label style={labelStyle}>Description</label>
                          <input value={newEntity.description} onChange={e=>setNewEntity({...newEntity, description:e.target.value})} placeholder="What does this entity represent?" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Icon</label>
                          <select value={newEntity.icon} onChange={e=>setNewEntity({...newEntity, icon:e.target.value})} style={inputStyle}>
                            {ICONS.map(i => <option key={i} value={i}>{i}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Data Source</label>
                          <select value={newEntity.data_source_type} onChange={e=>setNewEntity({...newEntity, data_source_type:e.target.value})} style={inputStyle}>
                            <option value="internal_api">Internal API</option>
                            <option value="integration">Integration</option>
                            <option value="custom_api">Custom API</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:10, marginTop:18, justifyContent:'flex-end' }}>
                        <button onClick={()=>setShowNewEntity(false)} style={btnSecondary}>Cancel</button>
                        <button onClick={createEntity} disabled={saving} style={btnPrimary}>{saving ? 'Creating...' : 'Create Entity'}</button>
                      </div>
                    </div>
                  )}

                  {/* Entity Cards */}
                  {entities.length === 0 ? (
                    <div style={{ textAlign:'center', padding:60, color:'#6b7280' }}>
                      <span className="material-symbols-outlined" style={{ fontSize:48, marginBottom:12, display:'block', opacity:0.4 }}>database</span>
                      <p style={{ fontSize:15, fontWeight:500 }}>No entities configured yet.</p>
                      <p style={{ fontSize:13, marginTop:4 }}>Create your first entity to define the business objects your agent can work with.</p>
                    </div>
                  ) : entities.map(ent => {
                    const isExpanded = expandedEntity === ent.id;
                    const fields = ent.fields || [];
                    const ops = ent.operations || [];
                    const existingOps = ops.map(o=>o.operation_name);
                    return (
                      <div key={ent.id} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, marginBottom:14, overflow:'hidden', transition:'all 0.2s' }}>
                        <div onClick={()=>setExpandedEntity(isExpanded?null:ent.id)} style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:14, cursor:'pointer' }}>
                          <div style={{ width:40, height:40, borderRadius:10, background:'rgba(59,130,246,0.1)', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid rgba(59,130,246,0.2)' }}>
                            <span className="material-symbols-outlined" style={{ color:'#60a5fa', fontSize:20 }}>{ent.icon||'box'}</span>
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <span style={{ color:'#f0f0f0', fontWeight:700, fontSize:15 }}>{ent.display_name}</span>
                              {ent.status === 'draft' && <span style={{ color:'#f59e0b', fontSize:10, fontWeight:800, background:'rgba(245,158,11,0.15)', padding:'2px 6px', borderRadius:4, border:'1px solid rgba(245,158,11,0.3)' }}>DRAFT</span>}
                              <span style={{ color:'#6b7280', fontSize:12, fontFamily:'monospace', background:'rgba(255,255,255,0.04)', padding:'2px 8px', borderRadius:6 }}>{ent.entity_name}</span>
                              <span style={{ color: ent.status === 'draft' ? '#9ca3af' : (ent.is_enabled ? '#34d399' : '#ef4444'), fontSize:11, fontWeight:600 }}>{ent.status === 'draft' ? 'Pending Review' : (ent.is_enabled?'Active':'Disabled')}</span>
                            </div>
                            <p style={{ color:'#9ca3af', fontSize:12, marginTop:2 }}>{ent.description || 'No description'} · {fields.length} fields · {ops.length} operations</p>
                          </div>
                          <span className="material-symbols-outlined" style={{ color:'#6b7280', fontSize:20, transform:isExpanded?'rotate(180deg)':'rotate(0)', transition:'transform 0.2s' }}>expand_more</span>
                        </div>

                        {isExpanded && (
                          <div style={{ padding:'0 20px 20px', borderTop:'1px solid rgba(255,255,255,0.04)' }}>
                            {/* Fields */}
                            <div style={{ marginTop:16 }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                                <h4 style={{ color:'#d1d5db', fontSize:13, fontWeight:700 }}>Fields</h4>
                                <button onClick={()=>setShowFieldForm(showFieldForm===ent.id?null:ent.id)} style={{ fontSize:12, color:'#60a5fa', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>+ Add Field</button>
                              </div>
                              {showFieldForm === ent.id && (
                                <div style={{ background:'rgba(59,130,246,0.04)', border:'1px solid rgba(59,130,246,0.1)', borderRadius:10, padding:14, marginBottom:12 }}>
                                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                                    <input value={newField.field_name} onChange={e=>setNewField({...newField,field_name:e.target.value.toLowerCase().replace(/\s/g,'_')})} placeholder="field_name" style={{...inputStyle,fontSize:12,padding:'6px 10px'}} />
                                    <input value={newField.display_name} onChange={e=>setNewField({...newField,display_name:e.target.value})} placeholder="Display Name" style={{...inputStyle,fontSize:12,padding:'6px 10px'}} />
                                    <select value={newField.field_type} onChange={e=>setNewField({...newField,field_type:e.target.value})} style={{...inputStyle,fontSize:12,padding:'6px 10px'}}>
                                      {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                  </div>
                                  <div style={{ display:'flex', gap:10, marginTop:10, alignItems:'center' }}>
                                    <label style={{ color:'#9ca3af', fontSize:12, display:'flex', alignItems:'center', gap:4 }}>
                                      <input type="checkbox" checked={newField.is_required} onChange={e=>setNewField({...newField,is_required:e.target.checked})} /> Required
                                    </label>
                                    <label style={{ color:'#9ca3af', fontSize:12, display:'flex', alignItems:'center', gap:4 }}>
                                      <input type="checkbox" checked={newField.is_searchable} onChange={e=>setNewField({...newField,is_searchable:e.target.checked})} /> Searchable
                                    </label>
                                    <div style={{ flex:1 }} />
                                    <button onClick={()=>addField(ent.id)} disabled={saving} style={{...btnPrimary,fontSize:12,padding:'5px 14px'}}>{saving?'...':'Add'}</button>
                                  </div>
                                </div>
                              )}
                              {fields.length === 0 ? <p style={{ color:'#6b7280', fontSize:12 }}>No fields defined.</p> : (
                                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                                  {fields.map(f => (
                                    <div key={f.id||f.field_name} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:'5px 10px' }}>
                                      <span style={{ color:'#d1d5db', fontSize:12, fontWeight:600 }}>{f.display_name}</span>
                                      <span style={{ color:'#6b7280', fontSize:10, fontFamily:'monospace' }}>{f.field_type}</span>
                                      {f.is_required && <span style={{ color:'#f59e0b', fontSize:9, fontWeight:700 }}>REQ</span>}
                                      {f.id && <button onClick={()=>deleteField(ent.id,f.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#6b7280', fontSize:14, padding:0, lineHeight:1 }}>×</button>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Operations */}
                            <div style={{ marginTop:16 }}>
                              <h4 style={{ color:'#d1d5db', fontSize:13, fontWeight:700, marginBottom:10 }}>Operations</h4>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                                {OPERATIONS.map(op => {
                                  const existing = ops.find(o=>o.operation_name===op);
                                  return (
                                    <button key={op} onClick={()=> existing ? deleteOperation(ent.id,existing.id) : addOperation(ent.id,op)}
                                      style={{ padding:'5px 14px', borderRadius:8, border:'1px solid', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.2s',
                                        background: existing ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.02)',
                                        borderColor: existing ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)',
                                        color: existing ? '#34d399' : '#6b7280' }}>
                                      {existing ? '✓ ' : ''}{op}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            {/* Actions */}
                            <div style={{ marginTop:18, borderTop:'1px solid rgba(255,255,255,0.04)', paddingTop:14, display:'flex', justifyContent:'flex-end', gap:10 }}>
                              {ent.status === 'draft' && (
                                <button onClick={()=>approveEntity(ent.id)} style={{ fontSize:12, color:'#34d399', background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.3)', borderRadius:8, padding:'5px 14px', cursor:'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                                  <span className="material-symbols-outlined" style={{ fontSize:14 }}>check_circle</span>
                                  Approve & Activate
                                </button>
                              )}
                              <button onClick={()=>deleteEntity(ent.id)} style={{ fontSize:12, color:'#ef4444', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'5px 14px', cursor:'pointer', fontWeight:600 }}>
                                Delete Entity
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* AGENT CONTEXT TAB */}
              {tab === 'context' && context && (
                <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:28 }}>
                  <h2 style={{ fontSize:18, fontWeight:700, color:'#e5e7eb', marginBottom:24 }}>Agent Behavior Configuration</h2>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
                    <div>
                      <label style={labelStyle}>Company Name</label>
                      <input value={context.company_name||''} onChange={e=>setContext({...context,company_name:e.target.value})} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Support Tone</label>
                      <select value={context.support_tone||'professional'} onChange={e=>setContext({...context,support_tone:e.target.value})} style={inputStyle}>
                        {TONES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn:'1/-1' }}>
                      <label style={labelStyle}>Company Description</label>
                      <textarea value={context.company_description||''} onChange={e=>setContext({...context,company_description:e.target.value})} rows={3} style={{...inputStyle, resize:'vertical'}} placeholder="Brief description of your company and what you do..." />
                    </div>
                    <div>
                      <label style={labelStyle}>Max Tool Calls Per Turn</label>
                      <input type="number" value={context.max_tool_calls_per_turn||5} onChange={e=>setContext({...context,max_tool_calls_per_turn:parseInt(e.target.value)||5})} style={inputStyle} min={1} max={20} />
                    </div>
                    <div>
                      <label style={labelStyle}>Auto-Escalate After Attempts</label>
                      <input type="number" value={context.auto_escalate_after_attempts||3} onChange={e=>setContext({...context,auto_escalate_after_attempts:parseInt(e.target.value)||3})} style={inputStyle} min={1} max={10} />
                    </div>
                    <div style={{ gridColumn:'1/-1' }}>
                      <label style={labelStyle}>Custom System Instructions</label>
                      <textarea value={context.custom_system_instructions||''} onChange={e=>setContext({...context,custom_system_instructions:e.target.value})} rows={5} style={{...inputStyle, resize:'vertical', fontFamily:'monospace', fontSize:13}} placeholder="Additional instructions appended to the agent's system prompt..." />
                    </div>
                    <div style={{ gridColumn:'1/-1' }}>
                      <label style={labelStyle}>Auto-Escalate Keywords (comma-separated)</label>
                      <input value={(context.auto_escalate_keywords||[]).join(', ')} onChange={e=>setContext({...context,auto_escalate_keywords:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} style={inputStyle} placeholder="urgent, critical, lawsuit, legal..." />
                    </div>
                  </div>
                  <div style={{ display:'flex', justifyContent:'flex-end', marginTop:24 }}>
                    <button onClick={saveContext} disabled={saving} style={btnPrimary}>{saving ? 'Saving...' : 'Save Configuration'}</button>
                  </div>
                </div>
              )}

              {/* INTEGRATIONS TAB */}
              {tab === 'integrations' && (
                <div style={{ textAlign:'center', padding:60 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:56, color:'#3b82f6', marginBottom:16, display:'block' }}>hub</span>
                  <h2 style={{ color:'#e5e7eb', fontSize:20, fontWeight:700, marginBottom:8 }}>Manage Integrations</h2>
                  <p style={{ color:'#9ca3af', fontSize:14, marginBottom:24, maxWidth:440, margin:'0 auto 24px' }}>
                    Connect external services like Gmail, Airtable, Stripe, and more via OAuth. Entity tools can pull data from these integrations.
                  </p>
                  <button onClick={()=>router.push('/mcp')} style={{...btnPrimary, fontSize:15, padding:'12px 32px'}}>
                    <span className="material-symbols-outlined" style={{ fontSize:18, verticalAlign:'middle', marginRight:8 }}>open_in_new</span>
                    Go to MCP Tools
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(-10px); opacity:0; } to { transform: translateY(0); opacity:1; } }
      `}</style>
    </>
  );
}

const labelStyle = { display:'block', color:'#9ca3af', fontSize:12, fontWeight:600, marginBottom:5, fontFamily:'Inter,sans-serif' };
const inputStyle = { width:'100%', padding:'9px 13px', borderRadius:9, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color:'#e5e7eb', fontSize:14, fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box' };
const btnPrimary = { padding:'9px 22px', borderRadius:10, border:'1px solid rgba(59,130,246,0.3)', background:'rgba(59,130,246,0.15)', color:'#60a5fa', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Inter,sans-serif', transition:'all 0.2s' };
const btnSecondary = { padding:'9px 22px', borderRadius:10, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color:'#9ca3af', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif' };
