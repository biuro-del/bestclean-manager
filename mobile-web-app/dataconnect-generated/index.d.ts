import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface BackupCycle_Key {
  orgId: string;
  cycleId: string;
  __typename?: 'BackupCycle_Key';
}

export interface BackupCyclesForOrgData {
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

export interface BackupCyclesForOrgVariables {
  orgId: string;
}

export interface CheckListDef_Key {
  orgId: string;
  clientId: string;
  dataObject: string;
  qrId: string;
  taskId: string;
  __typename?: 'CheckListDef_Key';
}

export interface CheckListExtra_Key {
  orgId: string;
  extraId: string;
  __typename?: 'CheckListExtra_Key';
}

export interface CheckListLog_Key {
  orgId: string;
  logId: string;
  __typename?: 'CheckListLog_Key';
}

export interface ClientInd_Key {
  orgId: string;
  qrCode: string;
  __typename?: 'ClientInd_Key';
}

export interface Client_Key {
  orgId: string;
  clientId: string;
  __typename?: 'Client_Key';
}

export interface ClientsForOrgData {
  clients: ({
    clientId: string;
    name?: string | null;
    nip?: string | null;
    city?: string | null;
    address?: string | null;
    contact?: string | null;
    coordinator?: string | null;
    status?: string | null;
    serviceFrequency?: string | null;
    assignees?: string | null;
    chemistry?: string | null;
    equipment?: string | null;
    clientInfo?: string | null;
  })[];
}

export interface ClientsForOrgVariables {
  orgId: string;
}

export interface DeleteClientForOrgData {
  client_delete?: Client_Key | null;
}

export interface DeleteClientForOrgVariables {
  orgId: string;
  clientId: string;
}

export interface DeleteEventForOrgData {
  event_delete?: BackupCycle_Key | null;
}

export interface DeleteEventForOrgVariables {
  orgId: string;
  eventId: string;
}

export interface DeleteIndividualJobForOrgData {
  individualClientJob_delete?: IndividualClientJob_Key | null;
}

export interface DeleteIndividualJobForOrgVariables {
  orgId: string;
  clientIndId: string;
}

export interface DeleteWorkdayForOrgData {
  workday_delete?: Workday_Key | null;
}

export interface DeleteWorkdayForOrgVariables {
  orgId: string;
  workdayId: string;
}

export interface DeleteZoneForOrgData {
  zone_delete?: Zone_Key | null;
}

export interface DeleteZoneForOrgVariables {
  orgId: string;
  zoneId: string;
}

export interface EventsForOrgData {
  events: ({
    eventId: string;
    zoneId?: string | null;
    workerLogin?: string | null;
    workerName?: string | null;
    startAt?: TimestampString | null;
    endAt?: TimestampString | null;
    durationSec?: number | null;
    status?: string | null;
    closeMarkedAt?: TimestampString | null;
    endReason?: string | null;
    comment?: string | null;
    deviceId?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    updatedAt?: TimestampString | null;
    createdAt?: TimestampString | null;
  })[];
}

export interface EventsForOrgVariables {
  orgId: string;
}

export interface IndividualClientJob_Key {
  orgId: string;
  clientIndId: string;
  __typename?: 'IndividualClientJob_Key';
}

export interface IndividualJobsForOrgData {
  individualClientJobs: ({
    clientIndId: string;
    date?: TimestampString | null;
    name?: string | null;
    nip?: string | null;
    city?: string | null;
    address?: string | null;
    contact?: string | null;
    clientInfo?: string | null;
    qrCode?: string | null;
  })[];
}

export interface IndividualJobsForOrgVariables {
  orgId: string;
}

export interface InsertClientForOrgData {
  client_insert: Client_Key;
}

export interface InsertClientForOrgVariables {
  orgId: string;
  clientId: string;
  name?: string | null;
  nip?: string | null;
  city?: string | null;
  address?: string | null;
  contact?: string | null;
  status?: string | null;
  coordinator?: string | null;
  serviceFrequency?: string | null;
  assignees?: string | null;
  chemistry?: string | null;
  equipment?: string | null;
  clientInfo?: string | null;
}

export interface InsertEventForOrgData {
  event_insert: BackupCycle_Key;
}

export interface InsertEventForOrgVariables {
  orgId: string;
  eventId: string;
  zoneId?: string | null;
  workerLogin?: string | null;
  startAt?: TimestampString | null;
  endAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
  closeMarkedAt?: TimestampString | null;
  endReason?: string | null;
  comment?: string | null;
  deviceId?: string | null;
  startEventId?: string | null;
  endEventId?: string | null;
}

export interface InsertIndividualJobForOrgData {
  individualClientJob_insert: IndividualClientJob_Key;
}

export interface InsertIndividualJobForOrgVariables {
  orgId: string;
  clientIndId: string;
  date?: TimestampString | null;
  name?: string | null;
  nip?: string | null;
  city?: string | null;
  address?: string | null;
  contact?: string | null;
  clientInfo?: string | null;
  qrCode?: string | null;
}

export interface InsertWorkdayForOrgData {
  workday_insert: Workday_Key;
}

export interface InsertWorkdayForOrgVariables {
  orgId: string;
  workdayId: string;
  workerLogin: string;
  workerName?: string | null;
  utilityRoomId?: string | null;
  startAt?: TimestampString | null;
  endAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
  comment?: string | null;
  updatedBy?: string | null;
}

export interface InsertWorkerForOrgData {
  worker_insert: Worker_Key;
}

export interface InsertWorkerForOrgVariables {
  orgId: string;
  login: string;
  fullName?: string | null;
  loginEmail?: string | null;
  role?: string | null;
  active?: boolean | null;
  email?: string | null;
  phone?: string | null;
  workerType?: string | null;
  workerId?: string | null;
}

export interface InsertZoneForOrgData {
  zone_insert: Zone_Key;
}

export interface InsertZoneForOrgVariables {
  orgId: string;
  zoneId: string;
  clientId: string;
  zone?: string | null;
  function?: string | null;
  editedBy?: string | null;
  date?: TimestampString | null;
  location?: string | null;
}

export interface MyOrganizationsData {
  organizationMembers: ({
    orgId: string;
    role: string;
    organization: {
      orgId: string;
      name: string;
      status?: string | null;
    } & Organization_Key;
  })[];
}

export interface OrganizationMember_Key {
  orgId: string;
  uid: string;
  __typename?: 'OrganizationMember_Key';
}

export interface Organization_Key {
  orgId: string;
  __typename?: 'Organization_Key';
}

export interface UpdateClientForOrgData {
  client_update?: Client_Key | null;
}

export interface UpdateClientForOrgVariables {
  orgId: string;
  clientId: string;
  name?: string | null;
  nip?: string | null;
  city?: string | null;
  address?: string | null;
  contact?: string | null;
  status?: string | null;
  coordinator?: string | null;
  serviceFrequency?: string | null;
  assignees?: string | null;
  chemistry?: string | null;
  equipment?: string | null;
  clientInfo?: string | null;
}

export interface UpdateEventForOrgData {
  event_update?: BackupCycle_Key | null;
}

export interface UpdateEventForOrgVariables {
  orgId: string;
  eventId: string;
  zoneId?: string | null;
  workerLogin?: string | null;
  startAt?: TimestampString | null;
  endAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
  closeMarkedAt?: TimestampString | null;
  endReason?: string | null;
  comment?: string | null;
  deviceId?: string | null;
  startEventId?: string | null;
  endEventId?: string | null;
}

export interface UpdateIndividualJobForOrgData {
  individualClientJob_update?: IndividualClientJob_Key | null;
}

export interface UpdateIndividualJobForOrgVariables {
  orgId: string;
  clientIndId: string;
  date?: TimestampString | null;
  name?: string | null;
  nip?: string | null;
  city?: string | null;
  address?: string | null;
  contact?: string | null;
  clientInfo?: string | null;
  qrCode?: string | null;
}

export interface UpdateWorkdayForOrgData {
  workday_update?: Workday_Key | null;
}

export interface UpdateWorkdayForOrgVariables {
  orgId: string;
  workdayId: string;
  workerLogin: string;
  workerName?: string | null;
  utilityRoomId?: string | null;
  startAt?: TimestampString | null;
  endAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
  comment?: string | null;
  updatedBy?: string | null;
}

export interface UpdateZoneForOrgData {
  zone_update?: Zone_Key | null;
}

export interface UpdateZoneForOrgVariables {
  orgId: string;
  zoneId: string;
  clientId: string;
  zone?: string | null;
  function?: string | null;
  editedBy?: string | null;
  date?: TimestampString | null;
  location?: string | null;
}

export interface WorkdayPause_Key {
  orgId: string;
  pauseId: string;
  __typename?: 'WorkdayPause_Key';
}

export interface Workday_Key {
  orgId: string;
  workdayId: string;
  __typename?: 'Workday_Key';
}

export interface WorkdaysForOrgData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endAt?: TimestampString | null;
    durationSec?: number | null;
    status?: string | null;
    comment?: string | null;
    updatedBy?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface WorkdaysForOrgVariables {
  orgId: string;
}

export interface WorkerWorkdaysForOrgData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endAt?: TimestampString | null;
    durationSec?: number | null;
    status?: string | null;
    comment?: string | null;
    updatedBy?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface WorkerWorkdaysForOrgVariables {
  orgId: string;
  workerLogin: string;
}

export interface Worker_Key {
  orgId: string;
  login: string;
  __typename?: 'Worker_Key';
}

export interface WorkersForOrgData {
  workers: ({
    login: string;
    fullName?: string | null;
    loginEmail?: string | null;
    role?: string | null;
    active?: boolean | null;
    workerType?: string | null;
  })[];
}

export interface WorkersForOrgVariables {
  orgId: string;
}

export interface Zone_Key {
  orgId: string;
  zoneId: string;
  __typename?: 'Zone_Key';
}

export interface ZonesForOrgData {
  zones: ({
    zoneId: string;
    clientId: string;
    zone?: string | null;
    function?: string | null;
    editedBy?: string | null;
    date?: TimestampString | null;
    location?: string | null;
  })[];
}

export interface ZonesForOrgVariables {
  orgId: string;
}

interface InsertWorkerForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertWorkerForOrgVariables): MutationRef<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertWorkerForOrgVariables): MutationRef<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;
  operationName: string;
}
export const insertWorkerForOrgRef: InsertWorkerForOrgRef;

export function insertWorkerForOrg(vars: InsertWorkerForOrgVariables): MutationPromise<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;
export function insertWorkerForOrg(dc: DataConnect, vars: InsertWorkerForOrgVariables): MutationPromise<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;

interface InsertClientForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertClientForOrgVariables): MutationRef<InsertClientForOrgData, InsertClientForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertClientForOrgVariables): MutationRef<InsertClientForOrgData, InsertClientForOrgVariables>;
  operationName: string;
}
export const insertClientForOrgRef: InsertClientForOrgRef;

export function insertClientForOrg(vars: InsertClientForOrgVariables): MutationPromise<InsertClientForOrgData, InsertClientForOrgVariables>;
export function insertClientForOrg(dc: DataConnect, vars: InsertClientForOrgVariables): MutationPromise<InsertClientForOrgData, InsertClientForOrgVariables>;

interface UpdateClientForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateClientForOrgVariables): MutationRef<UpdateClientForOrgData, UpdateClientForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateClientForOrgVariables): MutationRef<UpdateClientForOrgData, UpdateClientForOrgVariables>;
  operationName: string;
}
export const updateClientForOrgRef: UpdateClientForOrgRef;

export function updateClientForOrg(vars: UpdateClientForOrgVariables): MutationPromise<UpdateClientForOrgData, UpdateClientForOrgVariables>;
export function updateClientForOrg(dc: DataConnect, vars: UpdateClientForOrgVariables): MutationPromise<UpdateClientForOrgData, UpdateClientForOrgVariables>;

interface DeleteClientForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteClientForOrgVariables): MutationRef<DeleteClientForOrgData, DeleteClientForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteClientForOrgVariables): MutationRef<DeleteClientForOrgData, DeleteClientForOrgVariables>;
  operationName: string;
}
export const deleteClientForOrgRef: DeleteClientForOrgRef;

export function deleteClientForOrg(vars: DeleteClientForOrgVariables): MutationPromise<DeleteClientForOrgData, DeleteClientForOrgVariables>;
export function deleteClientForOrg(dc: DataConnect, vars: DeleteClientForOrgVariables): MutationPromise<DeleteClientForOrgData, DeleteClientForOrgVariables>;

interface InsertIndividualJobForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertIndividualJobForOrgVariables): MutationRef<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertIndividualJobForOrgVariables): MutationRef<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;
  operationName: string;
}
export const insertIndividualJobForOrgRef: InsertIndividualJobForOrgRef;

export function insertIndividualJobForOrg(vars: InsertIndividualJobForOrgVariables): MutationPromise<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;
export function insertIndividualJobForOrg(dc: DataConnect, vars: InsertIndividualJobForOrgVariables): MutationPromise<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;

interface UpdateIndividualJobForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateIndividualJobForOrgVariables): MutationRef<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateIndividualJobForOrgVariables): MutationRef<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;
  operationName: string;
}
export const updateIndividualJobForOrgRef: UpdateIndividualJobForOrgRef;

export function updateIndividualJobForOrg(vars: UpdateIndividualJobForOrgVariables): MutationPromise<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;
export function updateIndividualJobForOrg(dc: DataConnect, vars: UpdateIndividualJobForOrgVariables): MutationPromise<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;

interface DeleteIndividualJobForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteIndividualJobForOrgVariables): MutationRef<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteIndividualJobForOrgVariables): MutationRef<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;
  operationName: string;
}
export const deleteIndividualJobForOrgRef: DeleteIndividualJobForOrgRef;

export function deleteIndividualJobForOrg(vars: DeleteIndividualJobForOrgVariables): MutationPromise<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;
export function deleteIndividualJobForOrg(dc: DataConnect, vars: DeleteIndividualJobForOrgVariables): MutationPromise<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;

interface InsertZoneForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertZoneForOrgVariables): MutationRef<InsertZoneForOrgData, InsertZoneForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertZoneForOrgVariables): MutationRef<InsertZoneForOrgData, InsertZoneForOrgVariables>;
  operationName: string;
}
export const insertZoneForOrgRef: InsertZoneForOrgRef;

export function insertZoneForOrg(vars: InsertZoneForOrgVariables): MutationPromise<InsertZoneForOrgData, InsertZoneForOrgVariables>;
export function insertZoneForOrg(dc: DataConnect, vars: InsertZoneForOrgVariables): MutationPromise<InsertZoneForOrgData, InsertZoneForOrgVariables>;

interface UpdateZoneForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateZoneForOrgVariables): MutationRef<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateZoneForOrgVariables): MutationRef<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;
  operationName: string;
}
export const updateZoneForOrgRef: UpdateZoneForOrgRef;

export function updateZoneForOrg(vars: UpdateZoneForOrgVariables): MutationPromise<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;
export function updateZoneForOrg(dc: DataConnect, vars: UpdateZoneForOrgVariables): MutationPromise<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;

interface DeleteZoneForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteZoneForOrgVariables): MutationRef<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteZoneForOrgVariables): MutationRef<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;
  operationName: string;
}
export const deleteZoneForOrgRef: DeleteZoneForOrgRef;

export function deleteZoneForOrg(vars: DeleteZoneForOrgVariables): MutationPromise<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;
export function deleteZoneForOrg(dc: DataConnect, vars: DeleteZoneForOrgVariables): MutationPromise<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;

interface InsertWorkdayForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertWorkdayForOrgVariables): MutationRef<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertWorkdayForOrgVariables): MutationRef<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;
  operationName: string;
}
export const insertWorkdayForOrgRef: InsertWorkdayForOrgRef;

export function insertWorkdayForOrg(vars: InsertWorkdayForOrgVariables): MutationPromise<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;
export function insertWorkdayForOrg(dc: DataConnect, vars: InsertWorkdayForOrgVariables): MutationPromise<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;

interface UpdateWorkdayForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateWorkdayForOrgVariables): MutationRef<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateWorkdayForOrgVariables): MutationRef<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;
  operationName: string;
}
export const updateWorkdayForOrgRef: UpdateWorkdayForOrgRef;

export function updateWorkdayForOrg(vars: UpdateWorkdayForOrgVariables): MutationPromise<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;
export function updateWorkdayForOrg(dc: DataConnect, vars: UpdateWorkdayForOrgVariables): MutationPromise<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;

interface DeleteWorkdayForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteWorkdayForOrgVariables): MutationRef<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteWorkdayForOrgVariables): MutationRef<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;
  operationName: string;
}
export const deleteWorkdayForOrgRef: DeleteWorkdayForOrgRef;

export function deleteWorkdayForOrg(vars: DeleteWorkdayForOrgVariables): MutationPromise<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;
export function deleteWorkdayForOrg(dc: DataConnect, vars: DeleteWorkdayForOrgVariables): MutationPromise<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;

interface InsertEventForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertEventForOrgVariables): MutationRef<InsertEventForOrgData, InsertEventForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertEventForOrgVariables): MutationRef<InsertEventForOrgData, InsertEventForOrgVariables>;
  operationName: string;
}
export const insertEventForOrgRef: InsertEventForOrgRef;

export function insertEventForOrg(vars: InsertEventForOrgVariables): MutationPromise<InsertEventForOrgData, InsertEventForOrgVariables>;
export function insertEventForOrg(dc: DataConnect, vars: InsertEventForOrgVariables): MutationPromise<InsertEventForOrgData, InsertEventForOrgVariables>;

interface UpdateEventForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateEventForOrgVariables): MutationRef<UpdateEventForOrgData, UpdateEventForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateEventForOrgVariables): MutationRef<UpdateEventForOrgData, UpdateEventForOrgVariables>;
  operationName: string;
}
export const updateEventForOrgRef: UpdateEventForOrgRef;

export function updateEventForOrg(vars: UpdateEventForOrgVariables): MutationPromise<UpdateEventForOrgData, UpdateEventForOrgVariables>;
export function updateEventForOrg(dc: DataConnect, vars: UpdateEventForOrgVariables): MutationPromise<UpdateEventForOrgData, UpdateEventForOrgVariables>;

interface DeleteEventForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteEventForOrgVariables): MutationRef<DeleteEventForOrgData, DeleteEventForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteEventForOrgVariables): MutationRef<DeleteEventForOrgData, DeleteEventForOrgVariables>;
  operationName: string;
}
export const deleteEventForOrgRef: DeleteEventForOrgRef;

export function deleteEventForOrg(vars: DeleteEventForOrgVariables): MutationPromise<DeleteEventForOrgData, DeleteEventForOrgVariables>;
export function deleteEventForOrg(dc: DataConnect, vars: DeleteEventForOrgVariables): MutationPromise<DeleteEventForOrgData, DeleteEventForOrgVariables>;

interface MyOrganizationsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyOrganizationsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<MyOrganizationsData, undefined>;
  operationName: string;
}
export const myOrganizationsRef: MyOrganizationsRef;

export function myOrganizations(): QueryPromise<MyOrganizationsData, undefined>;
export function myOrganizations(dc: DataConnect): QueryPromise<MyOrganizationsData, undefined>;

interface WorkersForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkersForOrgVariables): QueryRef<WorkersForOrgData, WorkersForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkersForOrgVariables): QueryRef<WorkersForOrgData, WorkersForOrgVariables>;
  operationName: string;
}
export const workersForOrgRef: WorkersForOrgRef;

export function workersForOrg(vars: WorkersForOrgVariables): QueryPromise<WorkersForOrgData, WorkersForOrgVariables>;
export function workersForOrg(dc: DataConnect, vars: WorkersForOrgVariables): QueryPromise<WorkersForOrgData, WorkersForOrgVariables>;

interface ClientsForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: ClientsForOrgVariables): QueryRef<ClientsForOrgData, ClientsForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: ClientsForOrgVariables): QueryRef<ClientsForOrgData, ClientsForOrgVariables>;
  operationName: string;
}
export const clientsForOrgRef: ClientsForOrgRef;

export function clientsForOrg(vars: ClientsForOrgVariables): QueryPromise<ClientsForOrgData, ClientsForOrgVariables>;
export function clientsForOrg(dc: DataConnect, vars: ClientsForOrgVariables): QueryPromise<ClientsForOrgData, ClientsForOrgVariables>;

interface IndividualJobsForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: IndividualJobsForOrgVariables): QueryRef<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: IndividualJobsForOrgVariables): QueryRef<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;
  operationName: string;
}
export const individualJobsForOrgRef: IndividualJobsForOrgRef;

export function individualJobsForOrg(vars: IndividualJobsForOrgVariables): QueryPromise<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;
export function individualJobsForOrg(dc: DataConnect, vars: IndividualJobsForOrgVariables): QueryPromise<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;

interface ZonesForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: ZonesForOrgVariables): QueryRef<ZonesForOrgData, ZonesForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: ZonesForOrgVariables): QueryRef<ZonesForOrgData, ZonesForOrgVariables>;
  operationName: string;
}
export const zonesForOrgRef: ZonesForOrgRef;

export function zonesForOrg(vars: ZonesForOrgVariables): QueryPromise<ZonesForOrgData, ZonesForOrgVariables>;
export function zonesForOrg(dc: DataConnect, vars: ZonesForOrgVariables): QueryPromise<ZonesForOrgData, ZonesForOrgVariables>;

interface WorkdaysForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdaysForOrgVariables): QueryRef<WorkdaysForOrgData, WorkdaysForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkdaysForOrgVariables): QueryRef<WorkdaysForOrgData, WorkdaysForOrgVariables>;
  operationName: string;
}
export const workdaysForOrgRef: WorkdaysForOrgRef;

export function workdaysForOrg(vars: WorkdaysForOrgVariables): QueryPromise<WorkdaysForOrgData, WorkdaysForOrgVariables>;
export function workdaysForOrg(dc: DataConnect, vars: WorkdaysForOrgVariables): QueryPromise<WorkdaysForOrgData, WorkdaysForOrgVariables>;

interface BackupCyclesForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: BackupCyclesForOrgVariables): QueryRef<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: BackupCyclesForOrgVariables): QueryRef<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;
  operationName: string;
}
export const backupCyclesForOrgRef: BackupCyclesForOrgRef;

export function backupCyclesForOrg(vars: BackupCyclesForOrgVariables): QueryPromise<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;
export function backupCyclesForOrg(dc: DataConnect, vars: BackupCyclesForOrgVariables): QueryPromise<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;

interface EventsForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: EventsForOrgVariables): QueryRef<EventsForOrgData, EventsForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: EventsForOrgVariables): QueryRef<EventsForOrgData, EventsForOrgVariables>;
  operationName: string;
}
export const eventsForOrgRef: EventsForOrgRef;

export function eventsForOrg(vars: EventsForOrgVariables): QueryPromise<EventsForOrgData, EventsForOrgVariables>;
export function eventsForOrg(dc: DataConnect, vars: EventsForOrgVariables): QueryPromise<EventsForOrgData, EventsForOrgVariables>;

interface WorkerWorkdaysForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkerWorkdaysForOrgVariables): QueryRef<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkerWorkdaysForOrgVariables): QueryRef<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;
  operationName: string;
}
export const workerWorkdaysForOrgRef: WorkerWorkdaysForOrgRef;

export function workerWorkdaysForOrg(vars: WorkerWorkdaysForOrgVariables): QueryPromise<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;
export function workerWorkdaysForOrg(dc: DataConnect, vars: WorkerWorkdaysForOrgVariables): QueryPromise<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;

