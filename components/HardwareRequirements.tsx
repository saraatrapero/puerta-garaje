
import React from 'react';

const HardwareRequirements: React.FC = () => {
  const xiaoPins = [
    { pin: 'D0', device: 'Relé Abrir (OPN)', desc: 'Bornes OPN y COM del motor.' },
    { pin: 'D1', device: 'Relé Cerrar (CLS)', desc: 'Bornes CLS y COM del motor.' },
    { pin: 'D2', device: 'Relé Parar (STP)', desc: 'Bornes STP y COM del motor.' },
    { pin: 'D3', device: 'Control Carga', desc: 'A través de MOSFET al alimentador 5V.' },
    { pin: 'D4', device: 'Sensor Puerta (Reed)', desc: 'Detecta si la puerta está físicamente cerrada.' },
    { pin: 'GND', device: 'Tierra Común', desc: 'Punto común para relés y sensores.' }
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Guía de Conexión D4 */}
      <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-10 items-center">
          <div className="flex-1">
            <h3 className="text-2xl font-black text-slate-800 mb-4 flex items-center gap-3">
              <i className="fas fa-magnet text-indigo-500"></i>
              ¿Dónde conectar el D4?
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              El pin **D4** se utiliza para el sensor magnético (Reed Switch). Es un componente pasivo que no necesita voltaje de la placa del motor:
            </p>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-xs text-slate-600">
                <span className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">1</span>
                <span>Conecta un cable del sensor al pin **D4** del XIAO.</span>
              </li>
              <li className="flex items-start gap-3 text-xs text-slate-600">
                <span className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">2</span>
                <span>Conecta el otro cable del sensor al pin **GND** del XIAO.</span>
              </li>
              <li className="flex items-start gap-3 text-xs text-slate-600">
                <span className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">3</span>
                <span>Coloca el imán en la puerta de modo que cuando esté cerrada, quede a menos de 1cm del sensor.</span>
              </li>
            </ul>
          </div>
          <div className="w-full lg:w-72 aspect-square bg-slate-50 rounded-[3rem] border border-slate-100 flex items-center justify-center relative shadow-inner">
             <div className="text-center">
                <i className="fas fa-grip-lines-vertical text-slate-200 text-6xl absolute top-1/2 left-1/4 -translate-y-1/2"></i>
                <div className="relative z-10">
                   <div className="w-12 h-20 bg-indigo-600 rounded-lg shadow-lg flex items-center justify-center mb-2 mx-auto">
                      <i className="fas fa-microchip text-white text-xs"></i>
                   </div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sensor en Motor</p>
                   <div className="w-8 h-8 bg-rose-500 rounded-md shadow-md mt-4 mx-auto animate-bounce"></div>
                   <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Imán en Puerta</p>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Esquema de Potencia 220V */}
      <div className="p-10 bg-gradient-to-br from-slate-900 to-indigo-900 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden border border-indigo-500/30">
        <div className="relative z-10">
          <h3 className="text-2xl font-black mb-6 flex items-center gap-4">
            <i className="fas fa-plug-circle-bolt text-indigo-400"></i>
            Alimentación desde Motor X1
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed max-w-2xl mb-8">
            Deriva dos cables de los bornes **L** (Fase) y **N** (Neutro) de la entrada **X1** del motor hacia un cargador USB de 5V. 
            Este cargador alimentará el XIAO a través del MOSFET de carga controlado por el pin **D3**.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {xiaoPins.map((p, idx) => (
              <div key={idx} className="bg-white/5 p-4 rounded-2xl border border-white/10">
                <p className="text-indigo-400 font-black text-xs mb-1">{p.pin}</p>
                <p className="text-[10px] font-bold text-white uppercase">{p.device}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HardwareRequirements;
