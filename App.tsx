
import React, { useState, useEffect, useRef } from 'react';
import { DoorStatus, UserType, AccessUser, AccessLog } from './types';
import HardwareRequirements from './components/HardwareRequirements';
import { recognizeLicensePlate } from './services/geminiService';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

// Audio Helpers
function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

const App: React.FC = () => {
  const [doorState, setDoorState] = useState<DoorStatus>(DoorStatus.CLOSED);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'logs' | 'power' | 'hardware'>('dashboard');
  
  // Power & Thermal Management
  const [batteryLevel, setBatteryLevel] = useState(15);
  const [chargingCycleRequired, setChargingCycleRequired] = useState(false); // Histéresis 10-100%
  const [isChargingActive, setIsChargingActive] = useState(false); // Estado real Pin D3
  const [isProcessing, setIsProcessing] = useState(false); // Actividad Cámara/LPR
  const [cpuTemp, setCpuTemp] = useState(35);

  const [users] = useState<AccessUser[]>([
    { id: '1', name: 'Admin Principal', phone: '+34600112233', plate: '1234ABC', type: UserType.PERMANENT, active: true },
  ]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [isAwaiting2FA, setIsAwaiting2FA] = useState<AccessUser | null>(null);

  // Live Intercom State
  const [isIntercomActive, setIsIntercomActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const intercomSessionRef = useRef<any>(null);
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ciclo de Vida Inteligente de Batería y Temperatura
  useEffect(() => {
    const batteryManager = setInterval(() => {
      setBatteryLevel(prev => {
        // Lógica de histéresis: activa a 10%, desactiva a 100%
        if (prev <= 10) setChargingCycleRequired(true);
        if (prev >= 100) setChargingCycleRequired(false);

        if (isChargingActive) return Math.min(100, prev + 0.5);
        return Math.max(0, prev - 0.1);
      });

      // Simulación de Temperatura (Procesador + Carga)
      setCpuTemp(prev => {
        let target = 32;
        if (isChargingActive) target += 10;
        if (isProcessing || isIntercomActive) target += 15;
        return prev < target ? prev + 0.4 : prev - 0.2;
      });
    }, 2000);
    return () => clearInterval(batteryManager);
  }, [isChargingActive, isProcessing, isIntercomActive]);

  // Lógica del Pin D3 (MOSFET de Carga)
  useEffect(() => {
    // REGLA: Solo cargar si el ciclo lo pide Y NO hay actividad de video/voz
    const hardwareD3State = chargingCycleRequired && !isProcessing && !isIntercomActive;
    setIsChargingActive(hardwareD3State);
  }, [chargingCycleRequired, isProcessing, isIntercomActive]);

  // --- Live Intercom Logic ---
  const startIntercom = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsIntercomActive(true);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = audioContextInRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextInRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i]*inputData[i];
              setMicLevel(Math.sqrt(sum / inputData.length) * 100);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              sessionPromise.then(session => session.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextInRef.current!.destination);
          },
          onmessage: async (m: LiveServerMessage) => {
            const b64 = m.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (b64) {
              const ctx = audioContextOutRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buf = await decodeAudioData(decode(b64), ctx, 24000, 1);
              const src = ctx.createBufferSource();
              src.buffer = buf;
              src.connect(ctx.destination);
              src.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buf.duration;
              sourcesRef.current.add(src);
              src.onended = () => sourcesRef.current.delete(src);
            }
          },
          onclose: () => stopIntercom()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'Eres el interfono de seguridad de un garaje. Habla con claridad y profesionalidad.'
        }
      });
      intercomSessionRef.current = await sessionPromise;
    } catch (e) { console.error(e); }
  };

  const stopIntercom = () => {
    intercomSessionRef.current?.close();
    setIsIntercomActive(false);
    setMicLevel(0);
    audioContextInRef.current?.close();
    audioContextOutRef.current?.close();
  };

  const triggerRelay = (action: 'OPEN' | 'CLOSE' | 'STOP', user?: AccessUser) => {
    const statusMap = { OPEN: DoorStatus.OPENING, CLOSE: DoorStatus.CLOSING, STOP: DoorStatus.STOPPED };
    setDoorState(statusMap[action]);
    if (user && action === 'OPEN') {
      setLogs([{ id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toISOString(), userName: user.name, plate: user.plate, action: 'ENTRY', method: 'LPR' }, ...logs]);
      setIsAwaiting2FA(null);
    }
    if (action !== 'STOP') setTimeout(() => setDoorState(action === 'OPEN' ? DoorStatus.OPEN : DoorStatus.CLOSED), 4000);
  };

  const handleLPR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const b64 = (reader.result as string).split(',')[1];
      const plate = await recognizeLicensePlate(b64);
      if (plate) {
        const found = users.find(u => u.plate === plate);
        if (found) setIsAwaiting2FA(found);
      }
      setTimeout(() => setIsProcessing(false), 2000);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] pb-28">
      <header className="bg-slate-900 p-6 sticky top-0 z-50 shadow-xl border-b border-indigo-500/20">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-900/40">
              <i className="fas fa-microchip text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-white font-black uppercase tracking-tighter text-xl">XIAO <span className="text-indigo-400">SMART-POWER</span></h1>
              <p className="text-[9px] text-slate-400 font-bold tracking-widest uppercase">Modelo 400 Integrated</p>
            </div>
          </div>
          <div className="hidden md:flex gap-8">
            {['dashboard', 'users', 'logs', 'power', 'hardware'].map(t => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={`text-[10px] font-black uppercase tracking-widest ${activeTab === t ? 'text-indigo-400 underline underline-offset-8' : 'text-slate-500'}`}>{t}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white rounded-[3.5rem] p-12 shadow-sm border border-slate-200 flex flex-col items-center relative overflow-hidden">
              
              {/* Telemetría en Tiempo Real */}
              <div className="absolute top-10 left-10 flex gap-3">
                 <div className={`px-4 py-2 rounded-2xl border flex items-center gap-3 ${isChargingActive ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                    <i className={`fas ${isChargingActive ? 'fa-bolt-lightning animate-pulse' : 'fa-battery-full'}`}></i>
                    <span className="text-[10px] font-black uppercase tracking-widest">{isChargingActive ? 'Cargando de 220V' : 'Modo Batería'}</span>
                 </div>
                 {(isProcessing || isIntercomActive) && (
                   <div className="px-4 py-2 rounded-2xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center gap-2 animate-pulse">
                      <i className="fas fa-shield-halved"></i>
                      <span className="text-[10px] font-black uppercase tracking-widest">Protección Térmica</span>
                   </div>
                 )}
              </div>

              <div className={`w-72 h-72 rounded-full flex items-center justify-center transition-all duration-1000 ${doorState === DoorStatus.OPEN ? 'bg-teal-50' : 'bg-slate-50'}`}>
                <div className={`absolute w-80 h-80 rounded-full border-2 border-dashed ${doorState === DoorStatus.OPENING || doorState === DoorStatus.CLOSING ? 'border-indigo-400 animate-spin-slow' : 'border-slate-100'}`}></div>
                <i className={`fas ${doorState === DoorStatus.OPEN ? 'fa-door-open text-teal-500' : 'fa-door-closed text-slate-300'} text-8xl`}></i>
              </div>

              <h2 className="text-5xl font-black mt-10 text-slate-900 tracking-tighter uppercase">{doorState}</h2>

              {/* Controles de 3 Botones (X7) */}
              <div className="grid grid-cols-3 gap-6 mt-12 w-full max-w-md">
                <button onClick={() => triggerRelay('OPEN')} className="flex flex-col items-center gap-3 p-6 bg-slate-900 text-white rounded-[2.5rem] hover:bg-indigo-600 transition-all shadow-xl active:scale-95 group">
                  <i className="fas fa-chevron-up text-xl group-hover:-translate-y-1 transition-transform"></i>
                  <span className="text-[10px] font-black uppercase tracking-widest">Abrir</span>
                </button>
                <button onClick={() => triggerRelay('STOP')} className="flex flex-col items-center gap-3 p-6 bg-rose-500 text-white rounded-[2.5rem] hover:bg-rose-600 transition-all shadow-xl active:scale-95 group">
                  <i className="fas fa-stop text-xl group-hover:scale-110 transition-transform"></i>
                  <span className="text-[10px] font-black uppercase tracking-widest">Parar</span>
                </button>
                <button onClick={() => triggerRelay('CLOSE')} className="flex flex-col items-center gap-3 p-6 bg-slate-900 text-white rounded-[2.5rem] hover:bg-indigo-600 transition-all shadow-xl active:scale-95 group">
                  <i className="fas fa-chevron-down text-xl group-hover:translate-y-1 transition-transform"></i>
                  <span className="text-[10px] font-black uppercase tracking-widest">Cerrar</span>
                </button>
              </div>

              {/* Interfono de Voz */}
              <div className="mt-10 flex flex-col items-center gap-3">
                <button 
                  onClick={isIntercomActive ? stopIntercom : startIntercom}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isIntercomActive ? 'bg-rose-600 animate-pulse text-white' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'}`}
                >
                  <i className={`fas ${isIntercomActive ? 'fa-microphone-slash' : 'fa-microphone'} text-xl`}></i>
                </button>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Interfono Digital XIAO</span>
              </div>
              
              <button onClick={() => fileInputRef.current?.click()} className="mt-8 text-slate-300 hover:text-indigo-400 font-bold text-[9px] uppercase tracking-widest">Lanzar LPR Manual</button>
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleLPR} />
            </div>

            <div className="space-y-6">
              {/* Salud de Batería e IA */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden relative">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Estado de Energía</h3>
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-4xl font-black text-slate-900 tracking-tighter">{batteryLevel.toFixed(0)}%</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Carga Actual</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xl font-black tracking-tighter ${cpuTemp > 45 ? 'text-orange-500' : 'text-slate-900'}`}>{cpuTemp.toFixed(1)}°C</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase mt-1">CPU XIAO S3</p>
                    </div>
                  </div>
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${isChargingActive ? 'bg-indigo-500' : 'bg-teal-500'}`} style={{ width: `${batteryLevel}%` }}></div>
                  </div>
                  <div className={`p-4 rounded-2xl text-[10px] font-black uppercase leading-tight border ${isChargingActive ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                     <i className={`fas ${isChargingActive ? 'fa-bolt mr-2' : 'fa-moon mr-2'}`}></i>
                     {isChargingActive 
                        ? 'Carga Activa: Alimentador de 220V conectado' 
                        : isProcessing || isIntercomActive
                           ? 'Carga Pausada: Protegiendo hardware por actividad'
                           : 'Alimentador de 220V Desconectado (Modo Eco)'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative">
                <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Gemini Bridge</h3>
                <p className="text-sm text-slate-400 leading-relaxed italic">"He configurado la carga por umbrales: El cargador dormirá hasta que la batería llegue al 10%, optimizando la salud del circuito del XIAO."</p>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'hardware' && <HardwareRequirements />}
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin 10s linear infinite; }
      `}</style>
    </div>
  );
};

export default App;
