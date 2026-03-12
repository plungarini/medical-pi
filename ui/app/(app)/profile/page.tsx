'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { profileApi } from '@/lib/api';
import type { MedicalProfile } from '@/lib/types';
import {
	Activity,
	AlertTriangle,
	Clock,
	Download,
	Edit,
	FlaskConical,
	Heart,
	Info,
	Leaf,
	Pill,
	Scissors,
	Trash2,
	Upload,
	Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export default function ProfilePage() {
	const [profile, setProfile] = useState<MedicalProfile | null>(null);
	const [loading, setLoading] = useState(true);
	const [editingEntry, setEditingEntry] = useState<{
		field: string;
		entry: any;
	} | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const loadProfile = () => {
		profileApi
			.get()
			.then((data) => {
				setProfile(data);
				setLoading(false);
			})
			.catch(() => {
				setLoading(false);
			});
	};

	useEffect(() => {
		loadProfile();
	}, []);

	const handleDelete = async (field: string, id: string) => {
		try {
			await profileApi.deleteEntry(field, id);
			toast.success('Entry deleted');
			loadProfile();
		} catch (error) {
			toast.error('Failed to delete entry');
		}
	};

	const handleUpdate = async (field: string, id: string, updates: any) => {
		try {
			await profileApi.updateEntry(field, id, updates);
			toast.success('Entry updated');
			setEditingEntry(null);
			loadProfile();
		} catch (error) {
			toast.error('Failed to update entry');
		}
	};

	const handleExport = () => {
		if (!profile) return;
		const dataStr = JSON.stringify(profile, null, 2);
		const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

		const exportFileDefaultName = `medical-profile-${new Date().toISOString().split('T')[0]}.json`;

		const linkElement = document.createElement('a');
		linkElement.setAttribute('href', dataUri);
		linkElement.setAttribute('download', exportFileDefaultName);
		linkElement.click();
		toast.success('Profile exported successfully');
	};

	const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async (e) => {
			try {
				const content = e.target?.result as string;
				const importedData = JSON.parse(content);

				// Basic validation: ensure it has some medical-related fields
				if (!importedData.demographics && !importedData.medications && !importedData.allergies) {
					throw new Error('Invalid profile format');
				}

				await profileApi.update(importedData);
				toast.success('Profile imported successfully');
				loadProfile();
			} catch (error) {
				console.error('Import error:', error);
				toast.error(error instanceof Error ? error.message : 'Failed to import profile');
			}
		};
		reader.readAsText(file);

		// Reset input
		if (fileInputRef.current) fileInputRef.current.value = '';
	};

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
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
					<div>
						<h1 className="text-3xl font-bold">Medical Profile</h1>
						<p className="text-muted-foreground">Last updated: {new Date(profile.updatedAt).toLocaleDateString()}</p>
					</div>
					<div className="flex items-center gap-2">
						<input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
						<Button
							variant="outline"
							size="sm"
							onClick={() => fileInputRef.current?.click()}
							className="flex items-center gap-2"
						>
							<Upload className="h-4 w-4" />
							Import JSON
						</Button>
						<Button variant="outline" size="sm" onClick={handleExport} className="flex items-center gap-2">
							<Download className="h-4 w-4" />
							Export JSON
						</Button>
					</div>
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
						<ConditionsSection
							profile={profile}
							onEdit={(field, item) => setEditingEntry({ field, entry: item })}
							onDelete={handleDelete}
						/>
					</TabsContent>

					<TabsContent value="medications" className="space-y-4">
						<MedicationsSection
							profile={profile}
							onEdit={(field, item) => setEditingEntry({ field, entry: item })}
							onDelete={handleDelete}
						/>
					</TabsContent>

					<TabsContent value="allergies" className="space-y-4">
						<AllergiesSection
							profile={profile}
							onEdit={(field, item) => setEditingEntry({ field, entry: item })}
							onDelete={handleDelete}
						/>
					</TabsContent>

					<TabsContent value="vitals" className="space-y-4">
						<VitalsSection
							profile={profile}
							onEdit={(field, item) => setEditingEntry({ field, entry: item })}
							onDelete={handleDelete}
						/>
					</TabsContent>

					<TabsContent value="labs" className="space-y-4">
						<LabsSection
							profile={profile}
							onEdit={(field, item) => setEditingEntry({ field, entry: item })}
							onDelete={handleDelete}
						/>
					</TabsContent>

					<TabsContent value="surgeries" className="space-y-4">
						<SurgeriesSection
							profile={profile}
							onEdit={(field, item) => setEditingEntry({ field, entry: item })}
							onDelete={handleDelete}
						/>
					</TabsContent>

					<TabsContent value="family" className="space-y-4">
						<FamilySection
							profile={profile}
							onEdit={(field, item) => setEditingEntry({ field, entry: item })}
							onDelete={handleDelete}
						/>
					</TabsContent>

					<TabsContent value="lifestyle" className="space-y-4">
						<LifestyleSection
							profile={profile}
							onEdit={(field, item) => setEditingEntry({ field, entry: item })}
							onDelete={handleDelete}
						/>
					</TabsContent>
				</Tabs>
			</div>

			<Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Entry</DialogTitle>
						<DialogDescription>Modify the details of this profile entry.</DialogDescription>
					</DialogHeader>
					{editingEntry && (
						<div className="space-y-4 py-4">
							<div className="space-y-2">
								<Label>Notes / Description</Label>
								<Textarea
									placeholder="Enter a description..."
									defaultValue={editingEntry.entry.notes || ''}
									onChange={(e) =>
										setEditingEntry((prev) =>
											prev
												? {
														...prev,
														entry: { ...prev.entry, notes: e.target.value },
													}
												: null,
										)
									}
								/>
							</div>
						</div>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditingEntry(null)}>
							Cancel
						</Button>
						<Button
							onClick={() =>
								handleUpdate(editingEntry!.field, editingEntry!.entry.id, {
									notes: editingEntry!.entry.notes,
								})
							}
						>
							Save Changes
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</ScrollArea>
	);
}

function SeverityBadge({ severity }: Readonly<{ severity?: string }>) {
	if (!severity) return null;

	const s = severity.toLowerCase();
	let variant: 'default' | 'secondary' | 'outline' | 'destructive' = 'outline';
	let className = 'text-[10px] px-1.5 h-4 capitalize font-medium';

	if (s.includes('mild') || s.includes('low')) {
		className += ' bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
	} else if (s.includes('moderate') || s.includes('medium')) {
		className += ' bg-amber-500/10 text-amber-500 border-amber-500/20';
	} else if (s.includes('severe') || s.includes('high') || s.includes('critical')) {
		className += ' bg-destructive/10 text-destructive border-destructive/20';
	}

	return (
		<Badge variant={variant} className={className}>
			{severity}
		</Badge>
	);
}

function EntryCard({
	title,
	subtitle,
	field,
	item,
	onEdit,
	onDelete,
	severity,
}: Readonly<{
	title: string;
	subtitle?: string;
	field: string;
	item: any;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
	severity?: string;
}>) {
	return (
		<div className="group p-3 border rounded-lg bg-card/50 transition-colors hover:bg-card">
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1 space-y-1">
					<div className="flex items-center gap-2 flex-wrap">
						<p className="font-semibold">{title}</p>
						<div className="flex items-center gap-1.5">
							<Badge
								variant={item.source === 'auto' ? 'secondary' : 'outline'}
								className="text-[10px] px-1.5 h-4 capitalize"
							>
								{item.source}
							</Badge>
							<SeverityBadge severity={severity} />
						</div>
					</div>
					{subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
					{item.notes && (
						<div className="flex gap-1.5 mt-2 text-sm bg-muted/30 p-2 rounded-md border border-muted-foreground/10 italic">
							<Info className="h-4 w-4 shrink-0 text-muted-foreground/60 mt-0.5" />
							<p className="text-muted-foreground/80">{item.notes}</p>
						</div>
					)}
					{item.recordedAt && (
						<div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground/50">
							<Clock className="h-3 w-3" />
							<span>
								Added on {new Date(item.recordedAt).toLocaleDateString()} at{' '}
								{new Date(item.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
							</span>
						</div>
					)}
				</div>
				<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 text-muted-foreground hover:text-primary"
						onClick={() => onEdit(field, item)}
					>
						<Edit className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 text-muted-foreground hover:text-destructive"
						onClick={() => onDelete(field, item.id)}
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}

function ConditionsSection({
	profile,
	onEdit,
	onDelete,
}: {
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}) {
	const allConditions = [
		...(profile.currentConditions || []).map((c) => ({ ...c, _field: 'currentConditions' })),
		...(profile.persistentConditions || []).map((c) => ({ ...c, _field: 'persistentConditions' })),
		...(profile.pastConditions || []).map((c) => ({ ...c, _field: 'pastConditions' })),
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
			<CardContent className="space-y-3">
				{allConditions.length === 0 ? (
					<p className="text-muted-foreground italic">No conditions recorded</p>
				) : (
					allConditions.map((condition) => (
						<EntryCard
							key={condition.id}
							field={condition._field}
							item={condition}
							title={condition.name}
							subtitle={undefined}
							severity={condition.severity}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}

function MedicationsSection({
	profile,
	onEdit,
	onDelete,
}: {
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Pill className="h-5 w-5" />
					Medications
				</CardTitle>
				<CardDescription>Current medications and dosages</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{profile.medications?.length === 0 ? (
					<p className="text-muted-foreground italic">No medications recorded</p>
				) : (
					profile.medications?.map((med) => (
						<EntryCard
							key={med.id}
							field="medications"
							item={med}
							title={med.name}
							subtitle={med.dosage || med.frequency ? `${med.dosage} ${med.frequency}`.trim() : undefined}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}

function AllergiesSection({
	profile,
	onEdit,
	onDelete,
}: {
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<AlertTriangle className="h-5 w-5" />
					Allergies
				</CardTitle>
				<CardDescription>Known allergies and reactions</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{profile.allergies?.length === 0 ? (
					<p className="text-muted-foreground italic">No allergies recorded</p>
				) : (
					profile.allergies?.map((allergy) => (
						<EntryCard
							key={allergy.id}
							field="allergies"
							item={allergy}
							title={allergy.substance}
							subtitle={allergy.reaction ? `Reaction: ${allergy.reaction}` : undefined}
							severity={allergy.severity}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}

function VitalsSection({
	profile,
	onEdit,
	onDelete,
}: {
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Heart className="h-5 w-5" />
					Vital Signs
				</CardTitle>
				<CardDescription>Recorded vital measurements</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{profile.vitals?.length === 0 ? (
					<p className="text-muted-foreground italic">No vitals recorded</p>
				) : (
					profile.vitals?.map((vital) => (
						<EntryCard
							key={vital.id}
							field="vitals"
							item={vital}
							title={vital.type}
							subtitle={vital.value}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}

function LabsSection({
	profile,
	onEdit,
	onDelete,
}: {
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<FlaskConical className="h-5 w-5" />
					Lab Results
				</CardTitle>
				<CardDescription>Recent laboratory test results</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{profile.labResults?.length === 0 ? (
					<p className="text-muted-foreground italic">No lab results recorded</p>
				) : (
					profile.labResults?.map((lab) => (
						<EntryCard
							key={lab.id}
							field="labResults"
							item={lab}
							title={lab.name}
							subtitle={`${lab.value} ${lab.unit || ''}${lab.referenceRange ? ` (Ref: ${lab.referenceRange})` : ''}`}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}

function SurgeriesSection({
	profile,
	onEdit,
	onDelete,
}: {
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Scissors className="h-5 w-5" />
					Surgeries
				</CardTitle>
				<CardDescription>Surgical procedures history</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{profile.surgeries?.length === 0 ? (
					<p className="text-muted-foreground italic">No surgeries recorded</p>
				) : (
					profile.surgeries?.map((surgery) => (
						<EntryCard
							key={surgery.id}
							field="surgeries"
							item={surgery}
							title={surgery.name}
							subtitle={surgery.date ? `Date: ${new Date(surgery.date).toLocaleDateString()}` : undefined}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}

function FamilySection({
	profile,
	onEdit,
	onDelete,
}: {
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Users className="h-5 w-5" />
					Family History
				</CardTitle>
				<CardDescription>Medical conditions in family members</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{profile.familyHistory?.length === 0 ? (
					<p className="text-muted-foreground italic">No family history recorded</p>
				) : (
					profile.familyHistory?.map((family) => (
						<EntryCard
							key={family.id}
							field="familyHistory"
							item={family}
							title={`${family.relation}: ${family.condition}`}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}

function LifestyleSection({
	profile,
	onEdit,
	onDelete,
}: {
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}) {
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
			<CardContent className="space-y-3">
				{Object.keys(lifestyle).length === 0 ? (
					<p className="text-muted-foreground italic">No lifestyle information recorded</p>
				) : (
					Object.entries(lifestyle).map(([key, value]) => (
						<div
							key={key}
							className="group flex items-center justify-between p-3 border rounded-lg bg-card/50 transition-colors hover:bg-card"
						>
							<div className="space-y-1">
								<p className="font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
								<p className="text-sm text-muted-foreground">
									{Array.isArray(value) ? value.join(', ') : String(value) || 'Not specified'}
								</p>
							</div>
							<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-muted-foreground hover:text-primary"
									onClick={() =>
										onEdit('lifestyle', { id: key, notes: Array.isArray(value) ? value.join('\n') : String(value) })
									}
								>
									<Edit className="h-4 w-4" />
								</Button>
								{/* Delete for lifestyle might mean clear or delete key, but usually lifestyle keys are fixed in schema. 
                    We'll allow delete which will clear it. */}
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-muted-foreground hover:text-destructive"
									onClick={() => onDelete('lifestyle', key)}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						</div>
					))
				)}
			</CardContent>
		</Card>
	);
}
