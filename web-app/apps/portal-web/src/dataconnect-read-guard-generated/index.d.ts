import { ConnectorConfig, DataConnect, QueryRef, QueryPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface AuditLog_Key {
  auditId: string;
  __typename?: 'AuditLog_Key';
}

export interface BackupCycle_Key {
  orgId: string;
  cycleId: string;
  __typename?: 'BackupCycle_Key';
}

export interface BackupCyclesPageForOrgData {
  backupCycles: ({
    workdayId: string;
    workerLogin?: string | null;
    workerName?: string | null;
    utilityRoomId?: string | null;
    strefa?: string | null;
    pomieszczenie?: string | null;
    startAt?: TimestampString | null;
    endAt?: TimestampString | null;
    durationSec?: number | null;
    status?: string | null;
    comment?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface BackupCyclesPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}

export interface Client_Key {
  orgId: string;
  clientId: string;
  __typename?: 'Client_Key';
}

export interface ClientsPageForOrgData {
  clients: ({
    clientId: string;
    name?: string | null;
    nip?: string | null;
    city?: string | null;
    address?: string | null;
    contact?: string | null;
    coordinator?: string | null;
    status?: string | null;
    clientType?: string | null;
    serviceFrequency?: string | null;
    assignees?: string | null;
    chemistry?: string | null;
    equipment?: string | null;
    clientInfo?: string | null;
    objectType?: string | null;
    cooperationStartAt?: TimestampString | null;
    cooperationEndAt?: TimestampString | null;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    emergencyContact?: string | null;
    contactPosition?: string | null;
    postalCode?: string | null;
    accessHours?: string | null;
    accessMethod?: string | null;
    serviceEntry?: string | null;
    serviceType?: string | null;
    serviceDays?: string | null;
    preferredHours?: string | null;
    workMode?: string | null;
    sla?: string | null;
    rbhAmount?: number | null;
    requiredPermissions?: string | null;
    bhpRequirements?: string | null;
    workRestrictions?: string | null;
    excludedZones?: string | null;
    operationalRisks?: string | null;
    specialInstructions?: string | null;
    specialEquipment?: string | null;
    storagePlace?: string | null;
    backroomAccess?: string | null;
    technicalNotes?: string | null;
    internalNotes?: string | null;
    coordinatorChangedAt?: TimestampString | null;
    lastExecutionAt?: TimestampString | null;
    lastWorkerAssignmentAt?: TimestampString | null;
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface ClientsPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}

export interface Event_Key {
  orgId: string;
  eventId: string;
  __typename?: 'Event_Key';
}

export interface OrganizationCompanyProfile_Key {
  orgId: string;
  __typename?: 'OrganizationCompanyProfile_Key';
}

export interface OrganizationMember_Key {
  orgId: string;
  uid: string;
  __typename?: 'OrganizationMember_Key';
}

export interface OrganizationSubscription_Key {
  orgId: string;
  __typename?: 'OrganizationSubscription_Key';
}

export interface Organization_Key {
  orgId: string;
  __typename?: 'Organization_Key';
}

export interface RegistrationAttempt_Key {
  registrationId: string;
  __typename?: 'RegistrationAttempt_Key';
}

export interface SubscriptionEvent_Key {
  orgId: string;
  subscriptionEventId: string;
  __typename?: 'SubscriptionEvent_Key';
}

export interface SubscriptionPayment_Key {
  orgId: string;
  paymentId: string;
  __typename?: 'SubscriptionPayment_Key';
}

export interface Task_Key {
  orgId: string;
  idTask: string;
  __typename?: 'Task_Key';
}

export interface UserConsent_Key {
  consentId: string;
  __typename?: 'UserConsent_Key';
}

export interface WorkdayPause_Key {
  orgId: string;
  pauseId: string;
  __typename?: 'WorkdayPause_Key';
}

export interface WorkdayPausesPageForOrgData {
  workdayPauses: ({
    pauseId: string;
    workdayId: string;
    workerLogin?: string | null;
    workerName?: string | null;
    deviceId?: string | null;
    pauseEventId?: string | null;
    startAt?: TimestampString | null;
    stopAt?: TimestampString | null;
    durationSec?: number | null;
    status?: string | null;
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface WorkdayPausesPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}

export interface Workday_Key {
  orgId: string;
  workdayId: string;
  __typename?: 'Workday_Key';
}

export interface WorkerForOrgByLoginData {
  worker?: {
    login: string;
    workerId?: string | null;
    workerName?: string | null;
    loginEmail?: string | null;
    authUid?: string | null;
    role?: string | null;
    active?: boolean | null;
    email?: string | null;
    phone?: string | null;
    workerType?: string | null;
    edit?: string | null;
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
  };
}

export interface WorkerForOrgByLoginVariables {
  orgId: string;
  workerLogin: string;
}

export interface Worker_Key {
  orgId: string;
  login: string;
  __typename?: 'Worker_Key';
}

export interface WorkersPageForOrgData {
  organization?: {
    ownerWorkerId?: string | null;
  };
    workers: ({
      login: string;
      workerId?: string | null;
      workerName?: string | null;
      loginEmail?: string | null;
      authUid?: string | null;
      role?: string | null;
      active?: boolean | null;
      email?: string | null;
      phone?: string | null;
      workerType?: string | null;
      edit?: string | null;
      createdAt?: TimestampString | null;
      updatedAt?: TimestampString | null;
    })[];
}

export interface WorkersPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}

export interface Zone_Key {
  orgId: string;
  zoneId: string;
  __typename?: 'Zone_Key';
}

export interface ZonesPageForOrgData {
  zones: ({
    zoneId: string;
    clientId?: string | null;
    zone?: string | null;
    function?: string | null;
    requiredVisit: boolean;
    editedBy?: string | null;
    date?: TimestampString | null;
    location?: string | null;
  })[];
}

export interface ZonesPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}

interface WorkersPageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkersPageForOrgVariables): QueryRef<WorkersPageForOrgData, WorkersPageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkersPageForOrgVariables): QueryRef<WorkersPageForOrgData, WorkersPageForOrgVariables>;
  operationName: string;
}
export const workersPageForOrgRef: WorkersPageForOrgRef;

export function workersPageForOrg(vars: WorkersPageForOrgVariables): QueryPromise<WorkersPageForOrgData, WorkersPageForOrgVariables>;
export function workersPageForOrg(dc: DataConnect, vars: WorkersPageForOrgVariables): QueryPromise<WorkersPageForOrgData, WorkersPageForOrgVariables>;

interface WorkerForOrgByLoginRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkerForOrgByLoginVariables): QueryRef<WorkerForOrgByLoginData, WorkerForOrgByLoginVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkerForOrgByLoginVariables): QueryRef<WorkerForOrgByLoginData, WorkerForOrgByLoginVariables>;
  operationName: string;
}
export const workerForOrgByLoginRef: WorkerForOrgByLoginRef;

export function workerForOrgByLogin(vars: WorkerForOrgByLoginVariables): QueryPromise<WorkerForOrgByLoginData, WorkerForOrgByLoginVariables>;
export function workerForOrgByLogin(dc: DataConnect, vars: WorkerForOrgByLoginVariables): QueryPromise<WorkerForOrgByLoginData, WorkerForOrgByLoginVariables>;

interface ClientsPageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: ClientsPageForOrgVariables): QueryRef<ClientsPageForOrgData, ClientsPageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: ClientsPageForOrgVariables): QueryRef<ClientsPageForOrgData, ClientsPageForOrgVariables>;
  operationName: string;
}
export const clientsPageForOrgRef: ClientsPageForOrgRef;

export function clientsPageForOrg(vars: ClientsPageForOrgVariables): QueryPromise<ClientsPageForOrgData, ClientsPageForOrgVariables>;
export function clientsPageForOrg(dc: DataConnect, vars: ClientsPageForOrgVariables): QueryPromise<ClientsPageForOrgData, ClientsPageForOrgVariables>;

interface ZonesPageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: ZonesPageForOrgVariables): QueryRef<ZonesPageForOrgData, ZonesPageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: ZonesPageForOrgVariables): QueryRef<ZonesPageForOrgData, ZonesPageForOrgVariables>;
  operationName: string;
}
export const zonesPageForOrgRef: ZonesPageForOrgRef;

export function zonesPageForOrg(vars: ZonesPageForOrgVariables): QueryPromise<ZonesPageForOrgData, ZonesPageForOrgVariables>;
export function zonesPageForOrg(dc: DataConnect, vars: ZonesPageForOrgVariables): QueryPromise<ZonesPageForOrgData, ZonesPageForOrgVariables>;

interface BackupCyclesPageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: BackupCyclesPageForOrgVariables): QueryRef<BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: BackupCyclesPageForOrgVariables): QueryRef<BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables>;
  operationName: string;
}
export const backupCyclesPageForOrgRef: BackupCyclesPageForOrgRef;

export function backupCyclesPageForOrg(vars: BackupCyclesPageForOrgVariables): QueryPromise<BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables>;
export function backupCyclesPageForOrg(dc: DataConnect, vars: BackupCyclesPageForOrgVariables): QueryPromise<BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables>;

interface WorkdayPausesPageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdayPausesPageForOrgVariables): QueryRef<WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkdayPausesPageForOrgVariables): QueryRef<WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables>;
  operationName: string;
}
export const workdayPausesPageForOrgRef: WorkdayPausesPageForOrgRef;

export function workdayPausesPageForOrg(vars: WorkdayPausesPageForOrgVariables): QueryPromise<WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables>;
export function workdayPausesPageForOrg(dc: DataConnect, vars: WorkdayPausesPageForOrgVariables): QueryPromise<WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables>;

