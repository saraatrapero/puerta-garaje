
import React from 'react';

const HardwareRequirements: React.FC = () => {
  const xiaoPins = [
    { pin: 'D0', device: 'Relé Puerta', desc: 'Accionamiento del motor.' },
    { pin: 'D1', device: 'Reed Switch', desc: 'Sensor de puerta abierta/cerrada.' },
    { pin: 'D3', device: 'Control Carga (MOSFET)', desc: 'Corta/Habilita el alimentador de 5V.' },
    { pin: 'BAT +/-', device: 'Batería LiPo', desc: 'Alimentación constante del sistema.' }
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="p-8 bg-gradient-to-br from-teal-600 to-teal-800 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden border border-white/20">
        <div className="relative z-10">
          <h3 className="text-2xl font-black mb-4 flex items-center gap-3">
            <i className="fas fa-shield-heart text-white"></i>
            Protocolo de Vida Útil Superior
          </h3>
          <p className="text-sm text-teal-50 mb-6 max-w-2xl leading-relaxed">
            Hemos implementado un sistema de gestión energética industrial. El dispositivo opera en batería de forma nativa. El Pin <strong>D3</strong> solo activa el cargador cuando la batería llega al <strong>10%</strong>, y lo desconecta al <strong>100%</strong>.
            <br/><br/>
            <strong>Protección Dinámica:</strong> Si el sistema detecta que la cámara está procesando un LPR (video), el cargador se apaga inmediatamente para evitar el pico de calor (Procesador + Carga).
          </p>
        </div>
        <i className="fas fa-bolt absolute -bottom-6 -right-6 text-9xl opacity-20"></i>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
        <h3 className="text-xl font-black mb-6 text-slate-800">Wiring: Control Inteligente de 5V</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 font-mono text-[11px] text-slate-600">
            <p className="font-bold text-teal-600 mb-4">// Lógica de Control (Pin D3)</p>
            <p className="mb-2">1. Si Batería &lt; 10% Y Cámara == OFF:</p>
            <p className="ml-4 text-teal-700">DigitalWrite(D3, HIGH); // Carga luz ON</p>
            
            <p className="mt-4 mb-2">2. Si Cámara == ON (Procesando LPR):</p>
            <p className="ml-4 text-orange-600">DigitalWrite(D3, LOW); // Carga luz OFF (Enfriar)</p>
            
            <p className="mt-4 mb-2">3. Si Batería == 100%:</p>
            <p className="ml-4 text-slate-500">DigitalWrite(D3, LOW); // Descanso total</p>
          </div>
          <div className="space-y-3">
            {xiaoPins.map((p, idx) => (
              <div key={idx} className="flex items-center gap-4 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                <div className="w-12 h-10 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center font-black text-xs">
                  {p.pin}
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">{p.device}</p>
                  <p className="text-[10px] text-slate-500">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HardwareRequirements;
