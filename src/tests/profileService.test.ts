import { describe, it, expect, beforeEach } from 'vitest';
import {
  getProfile,
  updateProfile,
  getProfileHistory,
  deleteProfileEntry,
} from '../services/profileService.js';
import { db } from '../core/db.js';
import { v4 as uuidv4 } from 'uuid';
import type { MedicalProfile, Condition } from '../types/index.js';

describe('Profile Service', () => {
  const testUserId = uuidv4();

  beforeEach(() => {
    db.prepare('DELETE FROM profile_history WHERE user_id = ?').run(testUserId);
    db.prepare('DELETE FROM medical_profiles WHERE user_id = ?').run(testUserId);
  });

  it('should return default profile for new user', () => {
    const profile = getProfile(testUserId);

    expect(profile.userId).toBe(testUserId);
    expect(profile.currentConditions).toEqual([]);
    expect(profile.medications).toEqual([]);
    expect(profile.demographics).toEqual({});
  });

  it('should update profile', () => {
    const updates: Partial<MedicalProfile> = {
      demographics: {
        dateOfBirth: '1990-01-01',
        sex: 'male',
      },
      currentConditions: [
        {
          id: uuidv4(),
          name: 'Hypertension',
          source: 'manual',
        },
      ],
    };

    const profile = updateProfile(testUserId, updates);

    expect(profile.demographics.dateOfBirth).toBe('1990-01-01');
    expect(profile.currentConditions).toHaveLength(1);
    expect(profile.currentConditions[0].name).toBe('Hypertension');
  });

  it('should preserve existing data on partial update', () => {
    updateProfile(testUserId, {
      demographics: { sex: 'male' },
    });

    const updated = updateProfile(testUserId, {
      demographics: { height: '180cm' },
    });

    expect(updated.demographics.sex).toBe('male');
    expect(updated.demographics.height).toBe('180cm');
  });

  it('should delete profile entry', () => {
    const conditionId = uuidv4();
    updateProfile(testUserId, {
      currentConditions: [
        {
          id: conditionId,
          name: 'Diabetes',
          source: 'manual',
        },
        {
          id: uuidv4(),
          name: 'Hypertension',
          source: 'manual',
        },
      ],
    });

    const result = deleteProfileEntry(testUserId, 'currentConditions', conditionId);

    expect(result.currentConditions).toHaveLength(1);
    expect(result.currentConditions[0].name).toBe('Hypertension');
  });

  it('should get profile history', () => {
    // Create initial profile
    updateProfile(testUserId, {
      demographics: { sex: 'male' },
    });

    const history = getProfileHistory(testUserId);

    expect(Array.isArray(history)).toBe(true);
  });
});
