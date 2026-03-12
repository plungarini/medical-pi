"use client";

import { useEffect, useState } from "react";
import { profileApi } from "@/lib/api";
import type { MedicalProfile } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Pill,
  AlertTriangle,
  Heart,
  FlaskConical,
  Scissors,
  Users,
  User,
  Leaf,
} from "lucide-react";

export default function ProfilePage() {
  const [profile, setProfile] = useState<MedicalProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    profileApi
      .get()
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Failed to load profile</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)] lg:h-screen">
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold">Medical Profile</h1>
          <p className="text-muted-foreground">
            Last updated: {new Date(profile.updatedAt).toLocaleDateString()}
          </p>
        </div>

        <Tabs defaultValue="conditions">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
            <TabsTrigger value="medications">Meds</TabsTrigger>
            <TabsTrigger value="allergies">Allergies</TabsTrigger>
            <TabsTrigger value="vitals">Vitals</TabsTrigger>
            <TabsTrigger value="labs">Labs</TabsTrigger>
            <TabsTrigger value="surgeries">Surgery</TabsTrigger>
            <TabsTrigger value="family">Family</TabsTrigger>
            <TabsTrigger value="lifestyle">Life</TabsTrigger>
          </TabsList>

          <TabsContent value="conditions" className="space-y-4">
            <ConditionsSection profile={profile} />
          </TabsContent>

          <TabsContent value="medications" className="space-y-4">
            <MedicationsSection profile={profile} />
          </TabsContent>

          <TabsContent value="allergies" className="space-y-4">
            <AllergiesSection profile={profile} />
          </TabsContent>

          <TabsContent value="vitals" className="space-y-4">
            <VitalsSection profile={profile} />
          </TabsContent>

          <TabsContent value="labs" className="space-y-4">
            <LabsSection profile={profile} />
          </TabsContent>

          <TabsContent value="surgeries" className="space-y-4">
            <SurgeriesSection profile={profile} />
          </TabsContent>

          <TabsContent value="family" className="space-y-4">
            <FamilySection profile={profile} />
          </TabsContent>

          <TabsContent value="lifestyle" className="space-y-4">
            <LifestyleSection profile={profile} />
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}

function ConditionsSection({ profile }: { profile: MedicalProfile }) {
  const allConditions = [
    ...(profile.currentConditions || []),
    ...(profile.persistentConditions || []),
    ...(profile.pastConditions || []),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Medical Conditions
        </CardTitle>
        <CardDescription>Current and past medical conditions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {allConditions.length === 0 ? (
          <p className="text-muted-foreground">No conditions recorded</p>
        ) : (
          allConditions.map((condition) => (
            <div key={condition.id} className="flex items-center justify-between p-2 border rounded">
              <div>
                <p className="font-medium">{condition.name}</p>
                {condition.severity && (
                  <p className="text-sm text-muted-foreground">Severity: {condition.severity}</p>
                )}
              </div>
              <Badge variant={condition.source === "auto" ? "secondary" : "default"}>
                {condition.source}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MedicationsSection({ profile }: { profile: MedicalProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Pill className="h-5 w-5" />
          Medications
        </CardTitle>
        <CardDescription>Current medications and dosages</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {profile.medications?.length === 0 ? (
          <p className="text-muted-foreground">No medications recorded</p>
        ) : (
          profile.medications?.map((med) => (
            <div key={med.id} className="flex items-center justify-between p-2 border rounded">
              <div>
                <p className="font-medium">{med.name}</p>
                {(med.dosage || med.frequency) && (
                  <p className="text-sm text-muted-foreground">
                    {med.dosage} {med.frequency}
                  </p>
                )}
              </div>
              <Badge variant={med.source === "auto" ? "secondary" : "default"}>{med.source}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AllergiesSection({ profile }: { profile: MedicalProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Allergies
        </CardTitle>
        <CardDescription>Known allergies and reactions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {profile.allergies?.length === 0 ? (
          <p className="text-muted-foreground">No allergies recorded</p>
        ) : (
          profile.allergies?.map((allergy) => (
            <div key={allergy.id} className="flex items-center justify-between p-2 border rounded">
              <div>
                <p className="font-medium">{allergy.substance}</p>
                {allergy.reaction && (
                  <p className="text-sm text-muted-foreground">Reaction: {allergy.reaction}</p>
                )}
              </div>
              <Badge variant={allergy.source === "auto" ? "secondary" : "default"}>
                {allergy.source}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function VitalsSection({ profile }: { profile: MedicalProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-5 w-5" />
          Vital Signs
        </CardTitle>
        <CardDescription>Recorded vital measurements</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {profile.vitals?.length === 0 ? (
          <p className="text-muted-foreground">No vitals recorded</p>
        ) : (
          profile.vitals?.map((vital) => (
            <div key={vital.id} className="flex items-center justify-between p-2 border rounded">
              <div>
                <p className="font-medium">{vital.type}</p>
                <p className="text-sm text-muted-foreground">{vital.value}</p>
              </div>
              <Badge variant={vital.source === "auto" ? "secondary" : "default"}>
                {vital.source}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function LabsSection({ profile }: { profile: MedicalProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          Lab Results
        </CardTitle>
        <CardDescription>Recent laboratory test results</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {profile.labResults?.length === 0 ? (
          <p className="text-muted-foreground">No lab results recorded</p>
        ) : (
          profile.labResults?.map((lab) => (
            <div key={lab.id} className="flex items-center justify-between p-2 border rounded">
              <div>
                <p className="font-medium">{lab.name}</p>
                <p className="text-sm text-muted-foreground">
                  {lab.value} {lab.unit}
                  {lab.referenceRange && ` (Ref: ${lab.referenceRange})`}
                </p>
              </div>
              <Badge variant={lab.source === "auto" ? "secondary" : "default"}>{lab.source}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SurgeriesSection({ profile }: { profile: MedicalProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scissors className="h-5 w-5" />
          Surgeries
        </CardTitle>
        <CardDescription>Surgical procedures history</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {profile.surgeries?.length === 0 ? (
          <p className="text-muted-foreground">No surgeries recorded</p>
        ) : (
          profile.surgeries?.map((surgery) => (
            <div key={surgery.id} className="flex items-center justify-between p-2 border rounded">
              <div>
                <p className="font-medium">{surgery.name}</p>
                {surgery.date && (
                  <p className="text-sm text-muted-foreground">
                    Date: {new Date(surgery.date).toLocaleDateString()}
                  </p>
                )}
              </div>
              <Badge variant={surgery.source === "auto" ? "secondary" : "default"}>
                {surgery.source}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function FamilySection({ profile }: { profile: MedicalProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Family History
        </CardTitle>
        <CardDescription>Medical conditions in family members</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {profile.familyHistory?.length === 0 ? (
          <p className="text-muted-foreground">No family history recorded</p>
        ) : (
          profile.familyHistory?.map((family) => (
            <div key={family.id} className="flex items-center justify-between p-2 border rounded">
              <div>
                <p className="font-medium">
                  {family.relation}: {family.condition}
                </p>
              </div>
              <Badge variant={family.source === "auto" ? "secondary" : "default"}>
                {family.source}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function LifestyleSection({ profile }: { profile: MedicalProfile }) {
  const lifestyle = profile.lifestyle || {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Leaf className="h-5 w-5" />
          Lifestyle
        </CardTitle>
        <CardDescription>Lifestyle factors and habits</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.keys(lifestyle).length === 0 ? (
          <p className="text-muted-foreground">No lifestyle information recorded</p>
        ) : (
          Object.entries(lifestyle).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between p-2 border rounded">
              <div>
                <p className="font-medium capitalize">{key}</p>
                <p className="text-sm text-muted-foreground">{value || "Not specified"}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
