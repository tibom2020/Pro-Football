import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, BrainCircuit } from 'lucide-react';
import { PreGoalAnalysis } from '../types';

interface ChecklistProps {
  analysis: PreGoalAnalysis;
  stats: any;
}

export const AntiEmotionChecklist: React.FC<ChecklistProps> = ({ analysis, stats }) => {
  const [manualChecks, setManualChecks] = useState({
    consistentPressure: false,
    waitConfirm: false,
    manualEmotion: false,
  });

  const [autoChecks, setAutoChecks] = useState({
    apiTrend: false,
    onTarget: false,
    highProb: false,
  });

  useEffect(() => {
    // Determine auto checks based on passed analysis and stats
    const hasOnTarget = (stats?.on_target[0] || 0) + (stats?.on_target[1] || 0) > 0;
    
    setAutoChecks({
      apiTrend: analysis.factors.apiMomentum > 0.5, // Simplified threshold
      onTarget: hasOnTarget,
      highProb: analysis.score > 65,
    });
  }, [analysis, stats]);

  const toggleManual = (key: keyof typeof manualChecks) => {
    setManualChecks(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allPassed = 
    autoChecks.apiTrend && 
    autoChecks.onTarget && 
    autoChecks.highProb && 
    manualChecks.consistentPressure && 
    manualChecks.waitConfirm && 
    manualChecks.manualEmotion;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
      <div className="bg-slate-50 px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <BrainCircuit className="w-5 h-5 text-indigo-600" />
        <h3 className="font-bold text-gray-800 text-sm">Anti-Emotion Protocol</h3>
      </div>

      <div className="p-0">
        <table className="w-full text-sm">
          <tbody>
            {/* Auto Checks */}
            <CheckRow 
              label="API Momentum Rising" 
              status={autoChecks.apiTrend ? 'pass' : 'fail'} 
              type="AUTO" 
            />
            <CheckRow 
              label="Real On-Target Shots" 
              status={autoChecks.onTarget ? 'pass' : 'fail'} 
              type="AUTO" 
            />
            <CheckRow 
              label="Goal Prob > 65%" 
              status={autoChecks.highProb ? 'pass' : 'fail'} 
              type="AUTO" 
            />

            {/* Manual Checks */}
            <CheckRow 
              label="Pressure Consistent (3m)" 
              status={manualChecks.consistentPressure ? 'checked' : 'unchecked'} 
              type="MANUAL"
              onClick={() => toggleManual('consistentPressure')}
            />
            <CheckRow 
              label="Waited 2m for Trap" 
              status={manualChecks.waitConfirm ? 'checked' : 'unchecked'} 
              type="MANUAL"
              onClick={() => toggleManual('waitConfirm')}
            />
            <CheckRow 
              label="Would you bet if dashboard off?" 
              status={manualChecks.manualEmotion ? 'checked' : 'unchecked'} 
              type="Check Emotion"
              onClick={() => toggleManual('manualEmotion')}
              isWarning
            />
          </tbody>
        </table>
      </div>

      <div className={`p-3 text-center font-bold text-sm ${allPassed ? 'bg-green-100 text-green-800' : 'bg-red-50 text-red-800'}`}>
        {allPassed ? '✅ CONDITIONS MET - ENTRY SAFE' : '❌ DO NOT ENTER - HIGH RISK'}
      </div>
    </div>
  );
};

const CheckRow = ({ 
  label, 
  status, 
  type, 
  onClick, 
  isWarning 
}: { 
  label: string, 
  status: string, 
  type: string, 
  onClick?: () => void, 
  isWarning?: boolean 
}) => {
  const isPass = status === 'pass' || status === 'checked';
  
  return (
    <tr className={`border-b border-gray-50 last:border-0 ${isPass ? 'bg-green-50/30' : ''}`}>
      <td className={`p-3 text-gray-700 ${isWarning ? 'text-red-600 font-semibold' : ''}`}>{label}</td>
      <td className="p-3 w-24 text-center">
        <div className={`text-[10px] font-bold px-2 py-1 rounded mb-1 inline-block
          ${type === 'AUTO' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
          {type}
        </div>
      </td>
      <td className="p-3 w-12 text-center" onClick={onClick}>
        {type === 'AUTO' ? (
           isPass ? <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /> : <XCircle className="w-5 h-5 text-gray-300 mx-auto" />
        ) : (
          <div className={`w-5 h-5 rounded border mx-auto cursor-pointer flex items-center justify-center transition-colors
            ${isPass ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'}`}>
            {isPass && <div className="text-white font-bold text-xs">✓</div>}
          </div>
        )}
      </td>
    </tr>
  );
};