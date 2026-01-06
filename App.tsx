
import React, { useState, useEffect, useRef } from 'react';
import { DoorStatus, UserType, AccessUser, AccessLog } from './types';
import HardwareRequirements from './components/HardwareRequirements';
import { recognizeLicensePlate, analyzeSecurityLogs } from './services/geminiService';
import { GoogleGenAI, Modality } from '@google/genai';

const App: React.FC = () => {
  // State
  const [doorState, setDoorState] = useState<DoorStatus>(DoorStatus.CLOSED);
  const [users, setUsers] = useState<AccessUser[]>([
    { id: '1', name: 'Admin Principal', phone: '+34600112233', plate: '1234ABC', type: UserType.PERMANENT, active: true },
    { id: '2', name: 'Visita Juan', phone: '+34611223344', plate: '5678DEF', type: UserType.TEMPORARY, startDate: '2023-10-01T08:00', endDate: '2023-10-31T20:00', active: true },
    { id: '3', name: 'Expulsado', phone: '+34699887766', plate: '9999XYZ', type: UserType.BLACKLISTED, active: false },
  ]);
  const [logs, setLogs] = useState<AccessLog[]>([
    { id: 'l1', timestamp: new Date().toISOString(), userName: 'Admin Principal', plate: '1234ABC', action: 'ENTRY', method: 'LPR' }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAwaiting2FA, setIsAwaiting2FA] = useState<AccessUser | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  
  // Temporal UI States for split date/time
  const [tempStart, setTempStart] = useState({ date: new Date().toISOString().split('T')[0], time: '08:00' });
  const [tempEnd, setTempEnd] = useState({ date: new Date().toISOString().split('T')[0], time: '20:00' });

  const [newUser, setNewUser] = useState<Omit<AccessUser, 'id'>>({
    name: '', phone: '', plate: '', type: UserType.PERMANENT, active: true,
    startDate: '', endDate: ''
  });

  const [aiInsight, setAiInsight] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'logs' | 'hardware'>('dashboard');
  const [bleDetected, setBleDetected] = useState(false);
  
  // XIAO Sense Telemetry
  const [micLevel, setMicLevel] = useState(12);
  const [sdStatus] = useState<'READY' | 'ERROR' | 'NONE'>('READY');
  const [sdUsed] = useState(14);

  // Live Intercom State
  const [isIntercomActive, setIsIntercomActive] = useState(false);
  const [isConnectingIntercom, setIsConnectingIntercom] = useState(false);
  const intercomSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadInsights = async () => {
      const insight = await analyzeSecurityLogs(logs);
      setAiInsight(insight);
    };
    loadInsights();

    const telemetryInterval = setInterval(() => {
      setBleDetected(Math.random() > 0.8);
      if (!isIntercomActive) setMicLevel(Math.floor(Math.random() * 20) + 5);
    }, 3000);
    return () => clearInterval(telemetryInterval);
  }, [logs, isIntercomActive]);

  // --- Gemini Live Intercom Logic ---
  const startIntercom = async () => {
    setIsConnectingIntercom(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsIntercomActive(true);
            setIsConnectingIntercom(false);
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const sum = inputData.reduce((a, b) => a + b * b, 0);
              setMicLevel(Math.round(Math.sqrt(sum / inputData.length) * 100));

              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const base64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
              
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (msg) => {
            console.log("Intercom message received", msg);
          },
          onclose: () => stopIntercom(),
          onerror: (e) => {
            console.error("Intercom error", e);
            stopIntercom();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'Eres el sistema de intercomunicación de un garaje inteligente. Facilitas la charla entre el admin y el visitante. Mantén un tono profesional y alerta.',
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
        }
      });

      intercomSessionRef.current = sessionPromise;
    } catch (err) {
      console.error("Failed to start intercom", err);
      setIsConnectingIntercom(false);
    }
  };

  const stopIntercom = () => {
    if (intercomSessionRef.current) {
      intercomSessionRef.current.then((s: any) => s.close());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setIsIntercomActive(false);
    setIsConnectingIntercom(false);
  };

  const executeOpen = (user: AccessUser, method: AccessLog['method'] = 'LPR') => {
    setDoorState(DoorStatus.OPENING);
    setIsAwaiting2FA(null);
    setTimeout(() => {
      setDoorState(DoorStatus.OPEN);
      setLogs(prev => [{
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        userName: user.name,
        plate: user.plate,
        action: 'ENTRY',
        method
      }, ...prev]);
    }, 3000);
  };

  const toggleDoorManual = () => {
    const isOpening = doorState === DoorStatus.CLOSED;
    setDoorState(isOpening ? DoorStatus.OPENING : DoorStatus.CLOSING);
    setTimeout(() => {
      setDoorState(isOpening ? DoorStatus.OPEN : DoorStatus.CLOSED);
      setLogs(prev => [{
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        userName: 'Admin', plate: 'MANUAL', action: isOpening ? 'ENTRY' : 'EXIT', method: 'ADMIN'
      }, ...prev]);
    }, 3000);
  };

  const handleLPRSimulation = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const plate = await recognizeLicensePlate(base64);
      if (plate) {
        const foundUser = users.find(u => u.plate === plate.replace(/\s/g, ''));
        if (foundUser && foundUser.type !== UserType.BLACKLISTED && foundUser.active) {
          bleDetected ? executeOpen(foundUser, 'BLUETOOTH') : setIsAwaiting2FA(foundUser);
        } else {
          addDeniedLog(foundUser?.name || 'Desconocido', plate, foundUser?.type === UserType.BLACKLISTED ? 'Lista Negra' : 'No registrado');
        }
      }
      setIsProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleBiometricAuth = async () => {
    setIsProcessing(true);
    await new Promise(r => setTimeout(r, 800));
    const success = window.confirm("¿Autorizar apertura con biometría móvil?");
    setIsProcessing(false);
    if (success && isAwaiting2FA) executeOpen(isAwaiting2FA, 'LPR');
  };

  const addDeniedLog = (name: string, plate: string, reason: string) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      userName: name, plate, action: 'DENIED', method: 'LPR', reason
    }, ...prev]);
  };

  const isRangeValid = () => {
    if (newUser.type !== UserType.TEMPORARY) return true;
    const start = new Date(`${tempStart.date}T${tempStart.time}`);
    const end = new Date(`${tempEnd.date}T${tempEnd.time}`);
    return end > start;
  };

  const saveUser = () => {
    if (!newUser.name || !newUser.plate) return;
    
    let startVal = '';
    let endVal = '';
    
    if (newUser.type === UserType.TEMPORARY) {
      if (!isRangeValid()) {
        alert("La fecha/hora de fin debe ser posterior a la de inicio.");
        return;
      }
      if (tempStart.date) startVal = `${tempStart.date}T${tempStart.time}`;
      if (tempEnd.date) endVal = `${tempEnd.date}T${tempEnd.time}`;
    }

    setUsers([...users, { 
      ...newUser, 
      id: Date.now().toString(),
      startDate: startVal,
      endDate: endVal
    } as AccessUser]);
    
    setShowUserModal(false);
    setNewUser({ name: '', phone: '', plate: '', type: UserType.PERMANENT, active: true, startDate: '', endDate: '' });
    setTempStart({ date: new Date().toISOString().split('T')[0], time: '08:00' });
    setTempEnd({ date: new Date().toISOString().split('T')[0], time: '20:00' });
  };

  const handleStartDateChange = (date: string) => {
    setTempStart(prev => ({ ...prev, date }));
    // If end date is now before start date, update end date to match start
    if (tempEnd.date < date) {
      setTempEnd(prev => ({ ...prev, date }));
    }
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '---';
    return new Date(isoString).toLocaleString('es-ES', { 
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
    });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-20 md:pb-0">
      <header className="bg-slate-900 text-white border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(20,184,166,0.3)]">
              <i className="fas fa-microchip text-xl"></i>
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter leading-none">XIAO SENSE <span className="text-teal-400">GARAJE</span></h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Status: Active Node</p>
            </div>
          </div>
          <div className="hidden md:flex gap-8">
            {['dashboard', 'users', 'logs', 'hardware'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === tab ? 'text-teal-400' : 'text-slate-400 hover:text-white'}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-[3rem] p-10 shadow-[0_20px_50px_rgba(0,0,0,0.02)] border border-slate-100 flex flex-col items-center">
                <div className={`relative w-72 h-72 rounded-full flex items-center justify-center transition-all duration-1000 ${
                  doorState === DoorStatus.OPEN ? 'bg-teal-50' : doorState === DoorStatus.CLOSED ? 'bg-slate-50' : 'bg-indigo-50'
                }`}>
                   {isProcessing && <div className="absolute inset-0 rounded-full border-2 border-teal-500/20 animate-ping"></div>}
                   <div className={`absolute inset-4 rounded-full border-2 border-dashed ${
                     doorState === DoorStatus.OPEN ? 'border-teal-200' : 'border-slate-200'
                   } animate-[spin_20s_linear_infinite]`}></div>
                   <i className={`fas ${
                    doorState === DoorStatus.OPEN ? 'fa-door-open text-teal-500' : 
                    doorState === DoorStatus.CLOSED ? 'fa-door-closed text-slate-400' : 
                    'fa-circle-notch fa-spin text-indigo-500'
                  } text-8xl`}></i>
                </div>

                <div className="mt-10 text-center">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Hardware State</span>
                   <h2 className={`text-5xl font-black mt-2 tracking-tighter uppercase ${
                     doorState === DoorStatus.OPEN ? 'text-teal-600' : 'text-slate-800'
                   }`}>{doorState}</h2>
                </div>

                {isAwaiting2FA && (
                  <div className="mt-10 w-full max-w-sm bg-slate-900 rounded-[2rem] p-6 text-white shadow-2xl animate-bounce border-t-2 border-teal-500">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-teal-500/20 rounded-2xl flex items-center justify-center">
                        <i className="fas fa-fingerprint text-teal-400 text-xl"></i>
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Esperando Biometría</p>
                        <p className="font-bold text-sm">{isAwaiting2FA.name}</p>
                      </div>
                      <button onClick={handleBiometricAuth} className="bg-teal-500 text-slate-900 px-4 py-2 rounded-xl font-black text-xs hover:bg-teal-400">VALIDAR</button>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 mt-10">
                  <button onClick={toggleDoorManual} className="px-10 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black hover:bg-teal-600 transition-all shadow-xl shadow-slate-200 flex items-center gap-3 group">
                    <span>{doorState === DoorStatus.CLOSED ? 'ABRIR' : 'CERRAR'}</span>
                    <i className="fas fa-power-off text-teal-400 group-hover:text-white"></i>
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="p-5 bg-white border border-slate-200 text-slate-400 rounded-[1.5rem] hover:text-teal-600 hover:border-teal-200 transition-all shadow-sm">
                    <i className="fas fa-camera-viewfinder text-2xl"></i>
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleLPRSimulation} />
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden relative">
                   <div className="flex justify-between items-center mb-6">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Voice Intercom</h3>
                      {isIntercomActive && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>}
                   </div>
                   
                   <div className="flex flex-col items-center gap-4">
                      <div className="w-full h-16 bg-slate-50 rounded-2xl flex items-end justify-center gap-1 p-2 overflow-hidden">
                         {[...Array(12)].map((_, i) => (
                           <div key={i} 
                            style={{ height: `${isIntercomActive ? Math.random() * micLevel + 10 : 10}%` }}
                            className={`w-2 rounded-full transition-all duration-75 ${isIntercomActive ? 'bg-teal-500' : 'bg-slate-200'}`}></div>
                         ))}
                      </div>
                      
                      <button 
                        onClick={isIntercomActive ? stopIntercom : startIntercom}
                        disabled={isConnectingIntercom}
                        className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                          isIntercomActive ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'bg-slate-900 text-white hover:bg-teal-600'
                        }`}>
                        {isConnectingIntercom ? 'Conectando...' : isIntercomActive ? 'Detener Intercom' : 'Hablar con Visitante'}
                      </button>
                   </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Sense Telemetry</h3>
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between text-[10px] font-black text-slate-600 uppercase mb-2">
                        <span>Ambient Noise (XIAO Mic)</span>
                        <span>{micLevel} dB</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
                        {[...Array(20)].map((_, i) => (
                          <div key={i} className={`flex-1 h-full rounded-sm ${i < (micLevel/3) ? 'bg-teal-500' : 'bg-slate-200'}`}></div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <i className="fas fa-sd-card text-teal-600"></i>
                        <div className="leading-none">
                           <p className="text-[10px] font-black text-slate-400 uppercase">MicroSD Storage</p>
                           <p className="text-sm font-bold text-slate-800">{sdStatus}</p>
                        </div>
                      </div>
                      <div className="text-right"><p className="text-xs font-black text-teal-600">{sdUsed}%</p></div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden">
                   <div className="relative z-10">
                      <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <i className="fas fa-sparkles"></i> AI SECURITY SUMMARY
                      </h3>
                      <p className="text-sm text-slate-300 leading-relaxed italic">"{aiInsight || 'Analizando actividad sonora y visual...'}"</p>
                   </div>
                   <i className="fas fa-brain absolute -bottom-4 -right-4 text-7xl opacity-10"></i>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center px-2">
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">Acceso Concedido</h2>
              <button onClick={() => setShowUserModal(true)} className="px-6 py-3 bg-teal-600 text-white rounded-2xl font-bold hover:bg-teal-700 transition shadow-lg shadow-teal-200">
                + Nuevo Perfil
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {users.map(user => (
                <div key={user.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 hover:border-teal-200 transition-all group">
                   <div className="flex justify-between items-start mb-6">
                      <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 font-black text-lg group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                        {user.name.charAt(0)}
                      </div>
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter ${
                        user.type === UserType.PERMANENT ? 'bg-indigo-100 text-indigo-700' :
                        user.type === UserType.TEMPORARY ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {user.type}
                      </span>
                   </div>
                   <h4 className="font-black text-slate-800 text-lg mb-1">{user.name}</h4>
                   <p className="text-sm text-slate-400 mb-2 font-medium tracking-tight">{user.phone}</p>
                   
                   {user.type === UserType.TEMPORARY && (
                     <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-100 text-[10px] font-bold text-amber-800">
                       <p className="uppercase opacity-50 mb-1 tracking-widest">Validez Temporal</p>
                       <div className="flex items-center gap-2">
                         <i className="fas fa-clock opacity-40"></i>
                         <span>{formatDateTime(user.startDate)} — {formatDateTime(user.endDate)}</span>
                       </div>
                     </div>
                   )}

                   <div className="flex justify-between items-center pt-5 border-t border-slate-50">
                      <div className="px-4 py-1 bg-slate-100 rounded-lg font-mono font-black text-xs text-slate-600">
                        {user.plate}
                      </div>
                      <div className="flex gap-1">
                        <button className="w-9 h-9 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-teal-600 transition-all"><i className="fas fa-pen text-xs"></i></button>
                        <button onClick={() => setUsers(users.filter(u => u.id !== user.id))} className="w-9 h-9 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all"><i className="fas fa-trash text-xs"></i></button>
                      </div>
                   </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6 animate-fadeIn">
             <div className="flex justify-between items-end px-4">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Archivo Maestro</h2>
             </div>
             <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                <div className="divide-y divide-slate-50">
                   {logs.map(log => (
                     <div key={log.id} className="p-6 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-6">
                           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl ${
                             log.action === 'ENTRY' ? 'bg-teal-50 text-teal-600' :
                             log.action === 'DENIED' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                           }`}>
                             <i className={`fas ${log.action === 'ENTRY' ? 'fa-sign-in-alt' : log.action === 'DENIED' ? 'fa-hand' : 'fa-sign-out-alt'}`}></i>
                           </div>
                           <div>
                              <p className="font-black text-slate-800 uppercase text-sm tracking-tight">{log.userName}</p>
                              <p className="text-xs text-slate-400 font-bold">{new Date(log.timestamp).toLocaleString()}</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-8 text-right">
                           <p className="text-xs font-black text-indigo-600 uppercase">{log.method}</p>
                           <p className="text-xs font-mono font-black text-slate-800">{log.plate}</p>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        )}

        {activeTab === 'hardware' && (
          <div className="animate-fadeIn">
            <HardwareRequirements />
          </div>
        )}
      </main>

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl animate-scaleIn border border-white/20 max-h-[95vh] overflow-y-auto">
              <h3 className="text-2xl font-black text-slate-800 mb-8 tracking-tighter">Crear Nuevo Perfil</h3>
              <div className="space-y-6">
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre y Apellido</label>
                    <input type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full mt-2 px-6 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-teal-500 font-bold text-slate-700 transition-all" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Teléfono</label>
                       <input type="tel" value={newUser.phone} onChange={e => setNewUser({...newUser, phone: e.target.value})} className="w-full mt-2 px-6 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-teal-500 font-bold text-slate-700" />
                    </div>
                    <div>
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Matrícula</label>
                       <input type="text" value={newUser.plate} onChange={e => setNewUser({...newUser, plate: e.target.value.toUpperCase()})} className="w-full mt-2 px-6 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-teal-500 font-mono font-black text-slate-700" />
                    </div>
                 </div>
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Permiso</label>
                    <select value={newUser.type} onChange={e => setNewUser({...newUser, type: e.target.value as UserType})} className="w-full mt-2 px-6 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-teal-500 font-bold text-slate-700">
                       <option value={UserType.PERMANENT}>Permanente</option>
                       <option value={UserType.TEMPORARY}>Temporal</option>
                       <option value={UserType.BLACKLISTED}>Lista Negra</option>
                    </select>
                 </div>

                 {newUser.type === UserType.TEMPORARY && (
                   <div className="space-y-6 p-6 bg-slate-900 rounded-[2.5rem] animate-fadeIn shadow-inner border border-white/5">
                      {/* DESDE */}
                      <div>
                        <div className="flex items-center gap-2 mb-3 ml-1">
                          <i className="fas fa-calendar-alt text-teal-400 text-xs"></i>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inicia Acceso</label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                           <input 
                            type="date" 
                            value={tempStart.date} 
                            onChange={e => handleStartDateChange(e.target.value)} 
                            className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border-none text-white font-bold text-sm outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                           />
                           <input 
                            type="time" 
                            value={tempStart.time} 
                            onChange={e => setTempStart({...tempStart, time: e.target.value})} 
                            className="w-full px-4 py-3 rounded-xl bg-slate-800 border-none text-white font-bold text-sm outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                           />
                        </div>
                      </div>

                      {/* HASTA */}
                      <div>
                        <div className="flex items-center gap-2 mb-3 ml-1">
                          <i className="fas fa-history text-rose-400 text-xs"></i>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Termina Acceso</label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                           <input 
                            type="date" 
                            min={tempStart.date}
                            value={tempEnd.date} 
                            onChange={e => setTempEnd({...tempEnd, date: e.target.value})} 
                            className={`flex-1 px-4 py-3 rounded-xl bg-slate-800 border-none text-white font-bold text-sm outline-none focus:ring-2 focus:ring-teal-500 transition-all ${!isRangeValid() ? 'ring-2 ring-rose-500/50' : ''}`}
                           />
                           <input 
                            type="time" 
                            min={tempStart.date === tempEnd.date ? tempStart.time : undefined}
                            value={tempEnd.time} 
                            onChange={e => setTempEnd({...tempEnd, time: e.target.value})} 
                            className={`w-full px-4 py-3 rounded-xl bg-slate-800 border-none text-white font-bold text-sm outline-none focus:ring-2 focus:ring-teal-500 transition-all ${!isRangeValid() ? 'ring-2 ring-rose-500/50' : ''}`}
                           />
                        </div>
                        {!isRangeValid() && (
                          <p className="text-[10px] text-rose-400 font-black uppercase tracking-tighter mt-3 ml-1">
                            Error: La salida debe ser posterior a la entrada
                          </p>
                        )}
                      </div>
                   </div>
                 )}
              </div>
              <div className="flex gap-4 mt-10">
                 <button onClick={() => setShowUserModal(false)} className="flex-1 py-4 text-slate-400 font-black hover:bg-slate-50 rounded-2xl transition uppercase text-[10px] tracking-widest">Descartar</button>
                 <button 
                  onClick={saveUser} 
                  disabled={newUser.type === UserType.TEMPORARY && !isRangeValid()}
                  className={`flex-1 py-4 font-black rounded-2xl transition shadow-lg uppercase text-[10px] tracking-widest ${
                    (newUser.type === UserType.TEMPORARY && !isRangeValid()) 
                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed' 
                    : 'bg-teal-600 text-white hover:bg-teal-700 shadow-teal-200'
                  }`}>
                   Guardar Perfil
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Nav Mobile */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 bg-slate-900/90 backdrop-blur-xl rounded-[2rem] p-4 flex justify-around shadow-2xl z-40 border border-white/10">
        {[
          { icon: 'fa-house', tab: 'dashboard' },
          { icon: 'fa-users', tab: 'users' },
          { icon: 'fa-receipt', tab: 'logs' },
          { icon: 'fa-sliders', tab: 'hardware' }
        ].map(item => (
          <button key={item.tab} onClick={() => setActiveTab(item.tab as any)} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${activeTab === item.tab ? 'bg-teal-500 text-slate-900 scale-110 shadow-lg shadow-teal-500/20' : 'text-slate-500'}`}>
            <i className={`fas ${item.icon} text-lg`}></i>
          </button>
        ))}
      </nav>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-scaleIn { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};

export default App;
