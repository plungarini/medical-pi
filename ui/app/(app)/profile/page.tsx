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
	User,
	Users,
	FileText,
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
			console.error('Delete error:', error);
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
			console.error('Update error:', error);
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

		try {
			const content = await file.text();
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
						<h1 className="text-3xl font-bold tracking-tight">Medical Profile</h1>
						<p className="text-sm text-muted-foreground">
							Last synchronized: {new Date(profile.updatedAt).toLocaleString()}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
						<Button
							variant="outline"
							size="sm"
							onClick={() => fileInputRef.current?.click()}
							className="flex items-center gap-2 hover:bg-accent/50 transition-colors"
						>
							<Upload className="h-4 w-4" />
							Import JSON
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={handleExport}
							className="flex items-center gap-2 hover:bg-accent/50 transition-colors"
						>
							<Download className="h-4 w-4" />
							Export JSON
						</Button>
					</div>
				</div>

				<DemographicsSection
					profile={profile}
					onEdit={(field, item) => setEditingEntry({ field, entry: item })}
					onDelete={handleDelete}
				/>

				<Tabs defaultValue="conditions" className="w-full">
					<ScrollArea className="w-full">
						<TabsList className="flex w-max lg:w-full bg-muted/30 p-1 mb-4">
							<TabsTrigger value="conditions" className="px-4 py-2">Conditions</TabsTrigger>
							<TabsTrigger value="medications" className="px-4 py-2">Meds</TabsTrigger>
							<TabsTrigger value="allergies" className="px-4 py-2">Allergies</TabsTrigger>
							<TabsTrigger value="vitals" className="px-4 py-2">Vitals</TabsTrigger>
							<TabsTrigger value="labs" className="px-4 py-2">Labs</TabsTrigger>
							<TabsTrigger value="surgeries" className="px-4 py-2">Surgery</TabsTrigger>
							<TabsTrigger value="family" className="px-4 py-2">Family</TabsTrigger>
							<TabsTrigger value="lifestyle" className="px-4 py-2">Life</TabsTrigger>
							<TabsTrigger value="notes" className="px-4 py-2">Notes</TabsTrigger>
						</TabsList>
					</ScrollArea>

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
						<FamilyHistorySection
							profile={profile}
							onEdit={(field: string, item: any) => setEditingEntry({ field, entry: item })}
							onDelete={handleDelete}
						/>
					</TabsContent>

					<TabsContent value="lifestyle" className="space-y-4 focus-visible:outline-none">
						<LifestyleSection
							profile={profile}
							onEdit={(field: string, item: any) => setEditingEntry({ field, entry: item })}
							onDelete={handleDelete}
						/>
					</TabsContent>

					<TabsContent value="notes" className="space-y-4 focus-visible:outline-none">
						<NotesSection
							profile={profile}
							onEdit={(field: string, item: any) => setEditingEntry({ field, entry: item })}
							onDelete={handleDelete}
						/>
					</TabsContent>
				</Tabs>
			</div>

			<Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
				<DialogContent className="shadow-none">
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
		<div className="group p-4 border border-border/40 rounded-xl bg-card/40 backdrop-blur-md transition-all hover:bg-card/60">
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1 space-y-1.5">
					<div className="flex items-center gap-2 flex-wrap">
						<p className="font-bold text-base">{title}</p>
						<div className="flex items-center gap-1.5">
							<Badge
								variant={item.source === 'auto' ? 'secondary' : 'outline'}
								className="text-[10px] px-2 h-4 uppercase tracking-wider font-semibold opacity-70"
							>
								{item.source}
							</Badge>
							<SeverityBadge severity={severity} />
						</div>
					</div>
					{subtitle && <p className="text-sm text-muted-foreground leading-relaxed">{subtitle}</p>}
					{item.notes && (
						<div className="flex gap-2 mt-2.5 text-sm bg-accent/30 p-2.5 rounded-lg border border-accent/20 italic">
							<Info className="h-4 w-4 shrink-0 text-primary/40 mt-0.5" />
							<p className="text-muted-foreground/80 leading-snug">{item.notes}</p>
						</div>
					)}
					{item.recordedAt && (
						<div className="flex items-center gap-1.5 mt-3 text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">
							<Clock className="h-3 w-3" />
							<span>
								{new Date(item.recordedAt).toLocaleDateString()} •{' '}
								{new Date(item.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
							</span>
						</div>
					)}
				</div>
				<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100 shrink-0">
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
						onClick={() => onEdit(field, item)}
					>
						<Edit className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
						onClick={() => onDelete(field, item.id)}
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}

function DemographicsSection({
	profile,
	onEdit,
	onDelete,
}: Readonly<{
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}>) {
	const demo = profile.demographics || {};
	const stats = [
		{ label: 'Date of Birth', value: demo.dateOfBirth, key: 'dateOfBirth' },
		{ label: 'Sex', value: demo.sex, key: 'sex' },
		{ label: 'Height', value: demo.height, key: 'height' },
		{ label: 'Weight', value: demo.weight, key: 'weight' },
		{ label: 'Blood Type', value: demo.bloodType, key: 'bloodType' },
	];

	return (
		<Card className="border-border/40 bg-card/30 backdrop-blur-xl overflow-hidden">
			<CardHeader className="pb-3 border-b border-border/40">
				<CardTitle className="flex items-center gap-2 text-xl">
					<User className="h-5 w-5 text-primary" />
					Demographics
				</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-border/40">
					{stats.map((stat) => (
						<button
							key={stat.key}
							className="group relative p-4 flex flex-col gap-1 hover:bg-accent/20 transition-colors cursor-pointer text-left w-full border-none bg-transparent"
							onClick={() => onEdit('demographics', { id: stat.key, notes: String(stat.value || '') })}
						>
							<p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold">
								{stat.label}
							</p>
							<p className="font-semibold text-sm truncate">{stat.value || '—'}</p>
						</button>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

function ConditionsSection({
	profile,
	onEdit,
	onDelete,
}: Readonly<{
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}>) {
	const allConditions = [
		...(profile.currentConditions || []).map((c) => ({ ...c, _field: 'currentConditions' })),
		...(profile.persistentConditions || []).map((c) => ({ ...c, _field: 'persistentConditions' })),
		...(profile.pastConditions || []).map((c) => ({ ...c, _field: 'pastConditions' })),
	];

	return (
		<Card className="border-border/40 bg-card/30 backdrop-blur-xl transition-all">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Activity className="h-5 w-5 text-primary" />
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
							title={condition.condition || condition.name || 'Unknown Condition'}
							subtitle={[
								condition.diagnosedAt ? `Diagnosed: ${condition.diagnosedAt}` : '',
								condition.resolvedAt ? `Resolved: ${condition.resolvedAt}` : '',
							]
								.filter(Boolean)
								.join(' • ')}
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
}: Readonly<{
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}>) {
	return (
		<Card className="border-border/40 bg-card/30 backdrop-blur-xl transition-all">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Pill className="h-5 w-5 text-primary" />
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
							subtitle={[
								med.dosage || med.frequency ? `${med.dosage} ${med.frequency}`.trim() : '',
								med.startedAt ? `Started: ${med.startedAt}` : '',
							]
								.filter(Boolean)
								.join(' • ')}
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
}: Readonly<{
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}>) {
	return (
		<Card className="border-border/40 bg-card/30 backdrop-blur-xl transition-all">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<AlertTriangle className="h-5 w-5 text-primary" />
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
}: Readonly<{
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}>) {
	return (
		<Card className="border-border/40 bg-card/30 backdrop-blur-xl transition-all">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Heart className="h-5 w-5 text-primary" />
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
}: Readonly<{
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}>) {
	return (
		<Card className="border-border/40 bg-card/30 backdrop-blur-xl transition-all">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<FlaskConical className="h-5 w-5 text-primary" />
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
							subtitle={`${lab.value} ${lab.unit || ''}${lab.referenceRange ? ' (Ref: ' + lab.referenceRange + ')' : ''}`}
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
}: Readonly<{
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}>) {
	return (
		<Card className="border-border/40 bg-card/30 backdrop-blur-xl transition-all">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Scissors className="h-5 w-5 text-primary" />
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

function FamilyHistorySection({
	profile,
	onEdit,
	onDelete,
}: Readonly<{
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}>) {
	return (
		<Card className="border-border/40 bg-card/30 backdrop-blur-xl transition-all">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Users className="h-5 w-5 text-primary" />
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
}: Readonly<{
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}>) {
	const lifestyle = profile.lifestyle || {};

	return (
		<Card className="border-border/40 bg-card/30 backdrop-blur-xl transition-all">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Leaf className="h-5 w-5 text-primary" />
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
							className="group flex items-center justify-between p-3 border border-border/40 rounded-lg bg-card/50 transition-colors hover:bg-card/80"
						>
							<div className="space-y-1">
								<p className="font-semibold capitalize text-sm">{key.replaceAll(/([A-Z])/g, ' $1').trim()}</p>
								<p className="text-sm text-muted-foreground">
									{Array.isArray(value) ? value.join(', ') : String(value) || 'Not specified'}
								</p>
							</div>
							<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
									onClick={() =>
										onEdit('lifestyle', { id: key, notes: Array.isArray(value) ? value.join('\n') : String(value) })
									}
								>
									<Edit className="h-4 w-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
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

function NotesSection({
	profile,
	onEdit,
	onDelete,
}: Readonly<{
	profile: MedicalProfile;
	onEdit: (field: string, item: any) => void;
	onDelete: (field: string, id: string) => void;
}>) {
	return (
		<Card className="border-border/40 bg-card/30 backdrop-blur-xl transition-all">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<FileText className="h-5 w-5 text-primary" />
					General Notes
				</CardTitle>
				<CardDescription>Overall clinical observations and free-text notes</CardDescription>
			</CardHeader>
			<CardContent>
				<button 
					className="group relative p-6 border border-dashed border-border/60 rounded-xl bg-accent/5 hover:bg-accent/10 transition-all cursor-pointer min-h-[200px] text-left w-full"
					onClick={() => onEdit('freeNotes', { id: 'text', notes: profile.freeNotes || '' })}
				>
					{profile.freeNotes ? (
						<p className="whitespace-pre-wrap leading-relaxed text-muted-foreground italic">
							{profile.freeNotes}
						</p>
					) : (
						<div className="h-full flex flex-col items-center justify-center gap-2 py-8">
							<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground/40">
								<Info className="h-8 w-8" />
								<p className="italic text-sm">No general notes recorded</p>
							</div>
						</div>
					)}
					<div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
						<div className="flex items-center h-8 gap-2 px-3 py-1 bg-background border border-border/40 rounded-full text-xs font-medium shadow-sm">
							<Edit className="h-3.5 w-3.5" />
							Edit Notes
						</div>
					</div>
				</button>
			</CardContent>
		</Card>
	);
}
