import { useState, useEffect } from 'react';
import { ArrowLeft, User, LogOut, Activity, Pill, AlertTriangle, Heart, FileText, Users, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getProfile } from '../services/api';
import type { MedicalProfile } from '../../src/types';
import { ProfileSection } from '../components/ProfileSection';

interface ProfilePageProps {
  onLogout: () => void;
}

export function ProfilePage({ onLogout }: ProfilePageProps) {
  const [profile, setProfile] = useState<MedicalProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await getProfile();
      setProfile(data);
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-red-600">Failed to load profile</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/chat"
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">Medical Profile</h1>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Demographics */}
        <ProfileSection
          title="Demographics"
          icon={<User className="w-5 h-5" />}
          data={profile.demographics}
        />

        {/* Current Conditions */}
        <ProfileSection
          title="Current Conditions"
          icon={<Activity className="w-5 h-5" />}
          items={profile.currentConditions}
        />

        {/* Medications */}
        <ProfileSection
          title="Medications"
          icon={<Pill className="w-5 h-5" />}
          items={profile.medications}
        />

        {/* Allergies */}
        <ProfileSection
          title="Allergies"
          icon={<AlertTriangle className="w-5 h-5" />}
          items={profile.allergies}
        />

        {/* Vitals */}
        <ProfileSection
          title="Vital Readings"
          icon={<Heart className="w-5 h-5" />}
          items={profile.vitals}
        />

        {/* Lab Results */}
        <ProfileSection
          title="Lab Results"
          icon={<FileText className="w-5 h-5" />}
          items={profile.labResults}
        />

        {/* Surgeries */}
        <ProfileSection
          title="Surgeries"
          icon={<Calendar className="w-5 h-5" />}
          items={profile.surgeries}
        />

        {/* Family History */}
        <ProfileSection
          title="Family History"
          icon={<Users className="w-5 h-5" />}
          items={profile.familyHistory}
        />

        {/* Lifestyle */}
        <ProfileSection
          title="Lifestyle"
          icon={<Activity className="w-5 h-5" />}
          data={profile.lifestyle}
        />
      </main>
    </div>
  );
}
