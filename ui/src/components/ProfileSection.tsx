import { useState } from 'react';
import type { Condition, Medication, Allergy, VitalReading, LabResult, Surgery, FamilyCondition } from '../../src/types';

interface ProfileSectionProps {
  title: string;
  icon: React.ReactNode;
  items?: (Condition | Medication | Allergy | VitalReading | LabResult | Surgery | FamilyCondition)[];
  data?: Record<string, string | undefined>;
}

export function ProfileSection({ title, icon, items, data }: ProfileSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const hasContent = (items && items.length > 0) || (data && Object.keys(data).length > 0);

  return (
    <div className="bg-white rounded-lg shadow">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          <div className="text-blue-600">{icon}</div>
          <h2 className="text-lg font-medium text-gray-900">{title}</h2>
          {items && (
            <span className="text-sm text-gray-500">({items.length})</span>
          )}
        </div>
        <span className="text-gray-400">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {!hasContent ? (
            <p className="py-4 text-gray-500 text-center">No information recorded</p>
          ) : items ? (
            <div className="space-y-3 mt-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {'name' in item && item.name}
                        {'substance' in item && item.substance}
                        {'type' in item && 'value' in item && `${item.type}: ${item.value}`}
                        {'relation' in item && item.relation}
                      </h3>
                      {'severity' in item && item.severity && (
                        <span className="text-sm text-orange-600">{item.severity}</span>
                      )}
                      {'dosage' in item && item.dosage && (
                        <p className="text-sm text-gray-600">{item.dosage}</p>
                      )}
                      {'reaction' in item && item.reaction && (
                        <p className="text-sm text-gray-600">Reaction: {item.reaction}</p>
                      )}
                      {'notes' in item && item.notes && (
                        <p className="text-sm text-gray-600 mt-1">{item.notes}</p>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        item.source === 'auto'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {item.source}
                    </span>
                  </div>
                  {'confidence' in item && item.confidence !== undefined && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500">Confidence: {Math.round(item.confidence * 100)}%</div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full"
                          style={{ width: `${item.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : data ? (
            <div className="grid grid-cols-2 gap-4 mt-4">
              {Object.entries(data).map(([key, value]) =>
                value ? (
                  <div key={key} className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 uppercase">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    <div className="font-medium text-gray-900">{value}</div>
                  </div>
                ) : null
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
