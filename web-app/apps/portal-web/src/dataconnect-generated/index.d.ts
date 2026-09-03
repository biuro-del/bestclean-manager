import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface ActiveWorkdayPauseForWorkerData {
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

export interface ActiveWorkdayPauseForWorkerVariables {
  orgId: string;
  workerLogin: string;
}

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

export interface CanManageWorkersForOrgData {
  organizationMember?: {
    status?: string | null;
    role: string;
  };
}

export interface CanManageWorkersForOrgVariables {
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

export interface ClientStorageForClientData {
  clientStorages: ({
    orgId: string;
    clientId: string;
    productIndex: string;
    name: string;
    productType: string;
    quantity: number;
    quantityMin: number;
    quantityMax?: number | null;
    qrCode?: string | null;
    storage: {
      productId: string;
      quantity: number;
      quantityMin: number;
      quantityMax?: number | null;
    };
      client: {
        name?: string | null;
        status?: string | null;
      };
  } & ClientStorage_Key)[];
}

export interface ClientStorageForClientVariables {
  orgId: string;
  clientId: string;
  limit?: number | null;
  offset?: number | null;
}

export interface ClientStorageForOrgData {
  clientStorages: ({
    orgId: string;
    clientId: string;
    productIndex: string;
    name: string;
    productType: string;
    quantity: number;
    quantityMin: number;
    quantityMax?: number | null;
    qrCode?: string | null;
  } & ClientStorage_Key)[];
}

export interface ClientStorageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}

export interface ClientStorage_Key {
  orgId: string;
  clientId: string;
  productIndex: string;
  __typename?: 'ClientStorage_Key';
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

export interface ClientsForOrgVariables {
  orgId: string;
}

export interface DeleteClientForOrgData {
  checkListLog_deleteMany: number;
  checkListExtra_deleteMany: number;
  checkListDef_deleteMany: number;
  clientStorage_deleteMany: number;
  event_deleteMany: number;
  task_deleteMany: number;
  zone_deleteMany: number;
  client_delete?: Client_Key | null;
}

export interface DeleteClientForOrgVariables {
  orgId: string;
  clientId: string;
}

export interface DeleteClientStorageForOrgData {
  clientStorage_delete?: ClientStorage_Key | null;
}

export interface DeleteClientStorageForOrgVariables {
  orgId: string;
  clientId: string;
  productIndex: string;
}

export interface DeleteEventForOrgData {
  event_delete?: Event_Key | null;
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

export interface DeleteStorageForOrgData {
  storage_delete?: Storage_Key | null;
}

export interface DeleteStorageForOrgVariables {
  orgId: string;
  productIndex: string;
}

export interface DeleteTaskForOrgData {
  task_delete?: Task_Key | null;
}

export interface DeleteTaskForOrgVariables {
  orgId: string;
  idTask: string;
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

export interface Event_Key {
  orgId: string;
  eventId: string;
  __typename?: 'Event_Key';
}

export interface EventsFingerprintForOrgData {
  events: ({
    eventId: string;
    workdayId?: string | null;
    taskId?: string | null;
    occurrenceDateYmd?: string | null;
    serviceBlockId?: string | null;
    allocationId?: string | null;
    workSlotKey?: string | null;
    eventType?: string | null;
    matchStatus?: string | null;
    matchMethod?: string | null;
    matchReason?: string | null;
    matchedAt?: TimestampString | null;
    planSnapshotVersion?: number | null;
    plannedStartAt?: TimestampString | null;
    plannedEndAt?: TimestampString | null;
    plannedDurationMinutes?: number | null;
    taskUpdatedAtSnapshot?: TimestampString | null;
    startAt?: TimestampString | null;
    endAt?: TimestampString | null;
    status?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface EventsFingerprintForOrgVariables {
  orgId: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
}

export interface EventsForOrgData {
  events: ({
    eventId: string;
    workdayId?: string | null;
    zoneId?: string | null;
    taskId?: string | null;
    occurrenceDateYmd?: string | null;
    serviceBlockId?: string | null;
    allocationId?: string | null;
    workSlotKey?: string | null;
    eventType?: string | null;
    matchStatus?: string | null;
    matchMethod?: string | null;
    matchReason?: string | null;
    matchedAt?: TimestampString | null;
    planSnapshotVersion?: number | null;
    plannedStartAt?: TimestampString | null;
    plannedEndAt?: TimestampString | null;
    plannedDurationMinutes?: number | null;
    taskUpdatedAtSnapshot?: TimestampString | null;
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
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
    zone?: {
      zoneId: string;
      zone?: string | null;
      function?: string | null;
      location?: string | null;
      client?: {
        clientId: string;
        name?: string | null;
      };
    };
  })[];
}

export interface EventsForOrgVariables {
  orgId: string;
}

export interface EventsIntegrityPageForOrgData {
  events: ({
    eventId: string;
    workdayId?: string | null;
    eventType?: string | null;
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
    taskId?: string | null;
    occurrenceDateYmd?: string | null;
    serviceBlockId?: string | null;
    allocationId?: string | null;
    workSlotKey?: string | null;
    matchStatus?: string | null;
    matchMethod?: string | null;
    matchReason?: string | null;
    matchedAt?: TimestampString | null;
    planSnapshotVersion?: number | null;
    plannedStartAt?: TimestampString | null;
    plannedEndAt?: TimestampString | null;
    plannedDurationMinutes?: number | null;
    taskUpdatedAtSnapshot?: TimestampString | null;
    updatedAt?: TimestampString | null;
    zone?: {
      zoneId: string;
      zone?: string | null;
      function?: string | null;
      location?: string | null;
      clientId?: string | null;
      client?: {
        clientId: string;
        name?: string | null;
      };
    };
  })[];
}

export interface EventsIntegrityPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}

export interface EventsPageForOrgByPlanMatchStatusData {
  events: ({
    eventId: string;
    workdayId?: string | null;
    zoneId?: string | null;
    taskId?: string | null;
    occurrenceDateYmd?: string | null;
    serviceBlockId?: string | null;
    allocationId?: string | null;
    workSlotKey?: string | null;
    eventType?: string | null;
    matchStatus?: string | null;
    matchMethod?: string | null;
    matchReason?: string | null;
    matchedAt?: TimestampString | null;
    planSnapshotVersion?: number | null;
    plannedStartAt?: TimestampString | null;
    plannedEndAt?: TimestampString | null;
    plannedDurationMinutes?: number | null;
    taskUpdatedAtSnapshot?: TimestampString | null;
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
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
    zone?: {
      zoneId: string;
      zone?: string | null;
      function?: string | null;
      location?: string | null;
      client?: {
        clientId: string;
        name?: string | null;
      };
    };
  })[];
}

export interface EventsPageForOrgByPlanMatchStatusVariables {
  orgId: string;
  matchStatus: string;
  limit?: number | null;
  offset?: number | null;
}

export interface EventsPageForOrgByStatusData {
  events: ({
    eventId: string;
    workdayId?: string | null;
    zoneId?: string | null;
    taskId?: string | null;
    occurrenceDateYmd?: string | null;
    serviceBlockId?: string | null;
    allocationId?: string | null;
    workSlotKey?: string | null;
    eventType?: string | null;
    matchStatus?: string | null;
    matchMethod?: string | null;
    matchReason?: string | null;
    matchedAt?: TimestampString | null;
    planSnapshotVersion?: number | null;
    plannedStartAt?: TimestampString | null;
    plannedEndAt?: TimestampString | null;
    plannedDurationMinutes?: number | null;
    taskUpdatedAtSnapshot?: TimestampString | null;
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
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
    zone?: {
      zoneId: string;
      zone?: string | null;
      function?: string | null;
      location?: string | null;
      client?: {
        clientId: string;
        name?: string | null;
      };
    };
  })[];
}

export interface EventsPageForOrgByStatusVariables {
  orgId: string;
  status: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}

export interface EventsPageForOrgByTaskOccurrenceData {
  events: ({
    eventId: string;
    workdayId?: string | null;
    zoneId?: string | null;
    taskId?: string | null;
    occurrenceDateYmd?: string | null;
    serviceBlockId?: string | null;
    allocationId?: string | null;
    workSlotKey?: string | null;
    eventType?: string | null;
    matchStatus?: string | null;
    matchMethod?: string | null;
    matchReason?: string | null;
    matchedAt?: TimestampString | null;
    planSnapshotVersion?: number | null;
    plannedStartAt?: TimestampString | null;
    plannedEndAt?: TimestampString | null;
    plannedDurationMinutes?: number | null;
    taskUpdatedAtSnapshot?: TimestampString | null;
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
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
    zone?: {
      zoneId: string;
      zone?: string | null;
      function?: string | null;
      location?: string | null;
      client?: {
        clientId: string;
        name?: string | null;
      };
    };
  })[];
}

export interface EventsPageForOrgByTaskOccurrenceVariables {
  orgId: string;
  taskId: string;
  occurrenceDateYmd: string;
  limit?: number | null;
  offset?: number | null;
}

export interface EventsPageForOrgByWorkerData {
  events: ({
    eventId: string;
    workdayId?: string | null;
    zoneId?: string | null;
    taskId?: string | null;
    occurrenceDateYmd?: string | null;
    serviceBlockId?: string | null;
    allocationId?: string | null;
    workSlotKey?: string | null;
    eventType?: string | null;
    matchStatus?: string | null;
    matchMethod?: string | null;
    matchReason?: string | null;
    matchedAt?: TimestampString | null;
    planSnapshotVersion?: number | null;
    plannedStartAt?: TimestampString | null;
    plannedEndAt?: TimestampString | null;
    plannedDurationMinutes?: number | null;
    taskUpdatedAtSnapshot?: TimestampString | null;
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
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
    zone?: {
      zoneId: string;
      zone?: string | null;
      function?: string | null;
      location?: string | null;
      client?: {
        clientId: string;
        name?: string | null;
      };
    };
  })[];
}

export interface EventsPageForOrgByWorkerVariables {
  orgId: string;
  workerLogin: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}

export interface EventsPageForOrgByZoneData {
  events: ({
    eventId: string;
    workdayId?: string | null;
    zoneId?: string | null;
    taskId?: string | null;
    occurrenceDateYmd?: string | null;
    serviceBlockId?: string | null;
    allocationId?: string | null;
    workSlotKey?: string | null;
    eventType?: string | null;
    matchStatus?: string | null;
    matchMethod?: string | null;
    matchReason?: string | null;
    matchedAt?: TimestampString | null;
    planSnapshotVersion?: number | null;
    plannedStartAt?: TimestampString | null;
    plannedEndAt?: TimestampString | null;
    plannedDurationMinutes?: number | null;
    taskUpdatedAtSnapshot?: TimestampString | null;
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
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
    zone?: {
      zoneId: string;
      zone?: string | null;
      function?: string | null;
      location?: string | null;
      client?: {
        clientId: string;
        name?: string | null;
      };
    };
  })[];
}

export interface EventsPageForOrgByZoneVariables {
  orgId: string;
  zoneId: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}

export interface EventsPageForOrgData {
  events: ({
    eventId: string;
    workdayId?: string | null;
    zoneId?: string | null;
    taskId?: string | null;
    occurrenceDateYmd?: string | null;
    serviceBlockId?: string | null;
    allocationId?: string | null;
    workSlotKey?: string | null;
    eventType?: string | null;
    matchStatus?: string | null;
    matchMethod?: string | null;
    matchReason?: string | null;
    matchedAt?: TimestampString | null;
    planSnapshotVersion?: number | null;
    plannedStartAt?: TimestampString | null;
    plannedEndAt?: TimestampString | null;
    plannedDurationMinutes?: number | null;
    taskUpdatedAtSnapshot?: TimestampString | null;
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
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
    zone?: {
      zoneId: string;
      zone?: string | null;
      function?: string | null;
      location?: string | null;
      client?: {
        clientId: string;
        name?: string | null;
      };
    };
  })[];
}

export interface EventsPageForOrgVariables {
  orgId: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
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

export interface InsertBackupCycleForOrgData {
  backupCycle_insert: BackupCycle_Key;
}

export interface InsertBackupCycleForOrgVariables {
  orgId: string;
  cycleId: string;
  workerLogin?: string | null;
  workerName?: string | null;
  roomId?: string | null;
  strefa?: string | null;
  pomieszczenie?: string | null;
  startAt?: TimestampString | null;
  endAt?: TimestampString | null;
  durationSec?: number | null;
  endReason?: string | null;
  comment?: string | null;
  status?: string | null;
  closeMarkedAt?: TimestampString | null;
  deviceId?: string | null;
  startEventId?: string | null;
  endEventId?: string | null;
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
  clientType?: string | null;
  coordinator?: string | null;
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
}

export interface InsertClientStorageForOrgData {
  clientStorage_insert: ClientStorage_Key;
}

export interface InsertClientStorageForOrgVariables {
  orgId: string;
  clientId: string;
  productIndex: string;
  name: string;
  productType: string;
  quantity?: number | null;
  quantityMin?: number | null;
  quantityMax?: number | null;
  qrCode?: string | null;
}

export interface InsertEventForOrgData {
  event_insert: Event_Key;
}

export interface InsertEventForOrgVariables {
  orgId: string;
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

export interface InsertStorageForOrgData {
  storage_insert: Storage_Key;
}

export interface InsertStorageForOrgVariables {
  orgId: string;
  productIndex: string;
  productId: string;
  name: string;
  productType: string;
  quantity?: number | null;
  quantityMin?: number | null;
  quantityMax?: number | null;
  description?: string | null;
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
  gps?: string | null;
  comment?: string | null;
  updatedBy?: string | null;
}

export interface InsertZoneForOrgData {
  zone_insert: Zone_Key;
}

export interface InsertZoneForOrgVariables {
  orgId: string;
  zoneId: string;
  clientId?: string | null;
  zone?: string | null;
  function?: string | null;
  editedBy?: string | null;
  date?: TimestampString | null;
  location?: string | null;
}

export interface InsertZoneWithRequiredVisitForOrgData {
  zone_insert: Zone_Key;
}

export interface InsertZoneWithRequiredVisitForOrgVariables {
  orgId: string;
  zoneId: string;
  clientId?: string | null;
  zone?: string | null;
  function?: string | null;
  requiredVisit: boolean;
  editedBy?: string | null;
  date?: TimestampString | null;
  location?: string | null;
}

export interface MyOrganizationsData {
  organizationMembers: ({
    orgId: string;
    role: string;
    workerId?: string | null;
    status?: string | null;
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

export interface OrganizationProfile_Key {
  orgId: string;
  __typename?: 'OrganizationProfile_Key';
}

export interface OrganizationSubscription_Key {
  orgId: string;
  __typename?: 'OrganizationSubscription_Key';
}

export interface Organization_Key {
  orgId: string;
  __typename?: 'Organization_Key';
}

export interface ReidentifyEventForOrgData {
  event_update?: Event_Key | null;
}

export interface ReidentifyEventForOrgVariables {
  orgId: string;
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
}

export interface StartWorkdayPauseData {
  workdayPause_insert: WorkdayPause_Key;
  workday_update?: Workday_Key | null;
}

export interface StartWorkdayPauseVariables {
  orgId: string;
  pauseId: string;
  workdayId: string;
  workerLogin: string;
  workerName?: string | null;
  startAt?: TimestampString | null;
  stopAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
  pauseEventId?: string | null;
  deviceId?: string | null;
}

export interface StopWorkdayPauseData {
  workdayPause_update?: WorkdayPause_Key | null;
  workday_update?: Workday_Key | null;
}

export interface StopWorkdayPauseVariables {
  orgId: string;
  pauseId: string;
  workdayId: string;
  workerLogin?: string | null;
  stopAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
}

export interface StorageForOrgData {
  storages: ({
    orgId: string;
    productIndex: string;
    productId: string;
    name: string;
    productType: string;
    quantity: number;
    quantityMin: number;
    quantityMax?: number | null;
    description?: string | null;
    qrCode?: string | null;
  } & Storage_Key)[];
}

export interface StorageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}

export interface Storage_Key {
  orgId: string;
  productIndex: string;
  __typename?: 'Storage_Key';
}

export interface Task_Key {
  orgId: string;
  idTask: string;
  __typename?: 'Task_Key';
}

export interface TasksForOrgData {
  tasks: ({
    orgId: string;
    idTask: string;
    lifecycleStatus: string;
    cancelledAt?: TimestampString | null;
    archivedAt?: TimestampString | null;
    dateYmd?: string | null;
    startTime?: string | null;
    endDateYmd?: string | null;
    endTime?: string | null;
    scheduleMode?: string | null;
    accessStartTime?: string | null;
    accessEndTime?: string | null;
    accessWindows?: string | null;
    requiredWorkMinutes?: number | null;
    requiredPeople?: number | null;
    workAllocations?: string | null;
    workerId?: string | null;
    workerIds?: string | null;
    workerLabel?: string | null;
    workerName?: string | null;
    workerLogin?: string | null;
    clientId?: string | null;
    clientLabel?: string | null;
    clientName?: string | null;
    nip?: string | null;
    street?: string | null;
    city?: string | null;
    postCode?: string | null;
    addressLabel?: string | null;
    executionAddressLabel?: string | null;
    lat?: number | null;
    lng?: number | null;
    zoneId?: string | null;
    zoneLabel?: string | null;
    repeatPreset?: string | null;
    repeatEvery?: number | null;
    repeatUnit?: string | null;
    repeatWeekdays?: string | null;
    weeklyScheduleRules?: string | null;
    title?: string | null;
    type?: string | null;
    price?: number | null;
    description?: string | null;
    workerComment?: string | null;
    supplies?: string | null;
    objectPlanTasks?: string | null;
    allowExtendedWork?: boolean | null;
    createdByUid?: string | null;
    updatedByUid?: string | null;
    createdAt?: TimestampString | null;
    updatedAt?: TimestampString | null;
  } & Task_Key)[];
}

export interface TasksForOrgVariables {
  orgId: string;
}

export interface UpdateBackupCycleForOrgData {
  backupCycle_update?: BackupCycle_Key | null;
}

export interface UpdateBackupCycleForOrgVariables {
  orgId: string;
  cycleId: string;
  workerLogin?: string | null;
  workerName?: string | null;
  roomId?: string | null;
  strefa?: string | null;
  pomieszczenie?: string | null;
  startAt?: TimestampString | null;
  endAt?: TimestampString | null;
  durationSec?: number | null;
  endReason?: string | null;
  comment?: string | null;
  status?: string | null;
  closeMarkedAt?: TimestampString | null;
  deviceId?: string | null;
  startEventId?: string | null;
  endEventId?: string | null;
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
  clientType?: string | null;
  coordinator?: string | null;
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
}

export interface UpdateClientStorageForOrgData {
  clientStorage_update?: ClientStorage_Key | null;
}

export interface UpdateClientStorageForOrgVariables {
  orgId: string;
  clientId: string;
  productIndex: string;
  name?: string | null;
  productType?: string | null;
  quantity?: number | null;
  quantityMin?: number | null;
  quantityMax?: number | null;
  qrCode?: string | null;
}

export interface UpdateEventForOrgData {
  event_update?: Event_Key | null;
}

export interface UpdateEventForOrgVariables {
  orgId: string;
  eventId: string;
  workerName?: string | null;
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

export interface UpdateStorageForOrgData {
  storage_update?: Storage_Key | null;
}

export interface UpdateStorageForOrgVariables {
  orgId: string;
  productIndex: string;
  productId?: string | null;
  name?: string | null;
  productType?: string | null;
  quantity?: number | null;
  quantityMin?: number | null;
  quantityMax?: number | null;
  description?: string | null;
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
  gps?: string | null;
  comment?: string | null;
  updatedBy?: string | null;
}

export interface UpdateZoneForOrgData {
  zone_update?: Zone_Key | null;
}

export interface UpdateZoneForOrgVariables {
  orgId: string;
  zoneId: string;
  clientId?: string | null;
  zone?: string | null;
  function?: string | null;
  editedBy?: string | null;
  date?: TimestampString | null;
  location?: string | null;
}

export interface UpdateZoneWithRequiredVisitForOrgData {
  zone_update?: Zone_Key | null;
}

export interface UpdateZoneWithRequiredVisitForOrgVariables {
  orgId: string;
  zoneId: string;
  clientId?: string | null;
  zone?: string | null;
  function?: string | null;
  requiredVisit: boolean;
  editedBy?: string | null;
  date?: TimestampString | null;
  location?: string | null;
}

export interface UpsertTaskForOrgData {
  task_upsert: Task_Key;
}

export interface UpsertTaskForOrgVariables {
  orgId: string;
  idTask: string;
  lifecycleStatus?: string | null;
  cancelledAt?: TimestampString | null;
  archivedAt?: TimestampString | null;
  dateYmd?: string | null;
  startTime?: string | null;
  endDateYmd?: string | null;
  endTime?: string | null;
  scheduleMode?: string | null;
  accessStartTime?: string | null;
  accessEndTime?: string | null;
  accessWindows?: string | null;
  requiredWorkMinutes?: number | null;
  requiredPeople?: number | null;
  workAllocations?: string | null;
  workerId?: string | null;
  workerIds?: string | null;
  workerLabel?: string | null;
  workerName?: string | null;
  workerLogin?: string | null;
  clientId?: string | null;
  clientLabel?: string | null;
  clientName?: string | null;
  nip?: string | null;
  street?: string | null;
  city?: string | null;
  postCode?: string | null;
  addressLabel?: string | null;
  executionAddressLabel?: string | null;
  lat?: number | null;
  lng?: number | null;
  zoneId?: string | null;
  zoneLabel?: string | null;
  repeatPreset?: string | null;
  repeatEvery?: number | null;
  repeatUnit?: string | null;
  repeatWeekdays?: string | null;
  weeklyScheduleRules?: string | null;
  title?: string | null;
  type?: string | null;
  price?: number | null;
  description?: string | null;
  workerComment?: string | null;
  supplies?: string | null;
  objectPlanTasks?: string | null;
  allowExtendedWork?: boolean | null;
  createdByUid?: string | null;
  updatedByUid?: string | null;
  createdAt?: TimestampString | null;
  updatedAt?: TimestampString | null;
}

export interface WorkdayPause_Key {
  orgId: string;
  pauseId: string;
  __typename?: 'WorkdayPause_Key';
}

export interface WorkdayPausesForOrgData {
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

export interface WorkdayPausesForOrgVariables {
  orgId: string;
}

export interface WorkdayReconciliationAudit_Key {
  orgId: string;
  auditId: string;
  __typename?: 'WorkdayReconciliationAudit_Key';
}

export interface Workday_Key {
  orgId: string;
  workdayId: string;
  __typename?: 'Workday_Key';
}

export interface WorkdaysFingerprintForOrgData {
  workdays: ({
    workdayId: string;
    startAt?: TimestampString | null;
    endAt?: TimestampString | null;
    businessDateYmd?: string | null;
    status?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface WorkdaysFingerprintForOrgVariables {
  orgId: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
}

export interface WorkdaysForOrgData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endScanAt?: TimestampString | null;
    autoCloseAt?: TimestampString | null;
    endAt?: TimestampString | null;
    businessDateYmd?: string | null;
    durationSec?: number | null;
    status?: string | null;
    deviceId?: string | null;
    gps?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    startObject?: string | null;
    stopObject?: string | null;
    comment?: string | null;
    updatedBy?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface WorkdaysForOrgVariables {
  orgId: string;
}

export interface WorkdaysIntegrityPageForOrgData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endScanAt?: TimestampString | null;
    autoCloseAt?: TimestampString | null;
    endAt?: TimestampString | null;
    businessDateYmd?: string | null;
    durationSec?: number | null;
    status?: string | null;
    deviceId?: string | null;
    gps?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    startObject?: string | null;
    stopObject?: string | null;
    comment?: string | null;
    updatedBy?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface WorkdaysIntegrityPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}

export interface WorkdaysPageForOrgByBusinessDateData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endScanAt?: TimestampString | null;
    autoCloseAt?: TimestampString | null;
    endAt?: TimestampString | null;
    businessDateYmd?: string | null;
    durationSec?: number | null;
    status?: string | null;
    deviceId?: string | null;
    gps?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    startObject?: string | null;
    stopObject?: string | null;
    comment?: string | null;
    updatedBy?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface WorkdaysPageForOrgByBusinessDateVariables {
  orgId: string;
  fromBusinessDateYmd: string;
  toBusinessDateYmd: string;
  limit?: number | null;
  offset?: number | null;
}

export interface WorkdaysPageForOrgByRoomData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endScanAt?: TimestampString | null;
    autoCloseAt?: TimestampString | null;
    endAt?: TimestampString | null;
    businessDateYmd?: string | null;
    durationSec?: number | null;
    status?: string | null;
    deviceId?: string | null;
    gps?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    startObject?: string | null;
    stopObject?: string | null;
    comment?: string | null;
    updatedBy?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface WorkdaysPageForOrgByRoomVariables {
  orgId: string;
  utilityRoomId: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}

export interface WorkdaysPageForOrgByStatusData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endScanAt?: TimestampString | null;
    autoCloseAt?: TimestampString | null;
    endAt?: TimestampString | null;
    businessDateYmd?: string | null;
    durationSec?: number | null;
    status?: string | null;
    deviceId?: string | null;
    gps?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    startObject?: string | null;
    stopObject?: string | null;
    comment?: string | null;
    updatedBy?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface WorkdaysPageForOrgByStatusVariables {
  orgId: string;
  status: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}

export interface WorkdaysPageForOrgByWorkerAndStatusData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endScanAt?: TimestampString | null;
    autoCloseAt?: TimestampString | null;
    endAt?: TimestampString | null;
    businessDateYmd?: string | null;
    durationSec?: number | null;
    status?: string | null;
    deviceId?: string | null;
    gps?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    startObject?: string | null;
    stopObject?: string | null;
    comment?: string | null;
    updatedBy?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface WorkdaysPageForOrgByWorkerAndStatusVariables {
  orgId: string;
  workerLogin: string;
  status: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}

export interface WorkdaysPageForOrgByWorkerData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endScanAt?: TimestampString | null;
    autoCloseAt?: TimestampString | null;
    endAt?: TimestampString | null;
    businessDateYmd?: string | null;
    durationSec?: number | null;
    status?: string | null;
    deviceId?: string | null;
    gps?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    startObject?: string | null;
    stopObject?: string | null;
    comment?: string | null;
    updatedBy?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface WorkdaysPageForOrgByWorkerVariables {
  orgId: string;
  workerLogin: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}

export interface WorkdaysPageForOrgData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endScanAt?: TimestampString | null;
    autoCloseAt?: TimestampString | null;
    endAt?: TimestampString | null;
    businessDateYmd?: string | null;
    durationSec?: number | null;
    status?: string | null;
    deviceId?: string | null;
    gps?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    startObject?: string | null;
    stopObject?: string | null;
    comment?: string | null;
    updatedBy?: string | null;
    updatedAt?: TimestampString | null;
  })[];
}

export interface WorkdaysPageForOrgVariables {
  orgId: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}

export interface WorkerIdReservation_Key {
  orgId: string;
  workerNumber: number;
  __typename?: 'WorkerIdReservation_Key';
}

export interface WorkerWorkdaysForOrgData {
  workdays: ({
    workdayId: string;
    workerLogin: string;
    workerName?: string | null;
    utilityRoomId?: string | null;
    startAt?: TimestampString | null;
    endScanAt?: TimestampString | null;
    autoCloseAt?: TimestampString | null;
    endAt?: TimestampString | null;
    businessDateYmd?: string | null;
    durationSec?: number | null;
    status?: string | null;
    deviceId?: string | null;
    gps?: string | null;
    startEventId?: string | null;
    endEventId?: string | null;
    startObject?: string | null;
    stopObject?: string | null;
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
      photoUrl?: string | null;
      workerType?: string | null;
      edit?: string | null;
      createdAt?: TimestampString | null;
      updatedAt?: TimestampString | null;
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
    clientId?: string | null;
    zone?: string | null;
    function?: string | null;
    requiredVisit: boolean;
    editedBy?: string | null;
    date?: TimestampString | null;
    location?: string | null;
  })[];
}

export interface ZonesForOrgVariables {
  orgId: string;
}

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

interface UpsertTaskForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertTaskForOrgVariables): MutationRef<UpsertTaskForOrgData, UpsertTaskForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpsertTaskForOrgVariables): MutationRef<UpsertTaskForOrgData, UpsertTaskForOrgVariables>;
  operationName: string;
}
export const upsertTaskForOrgRef: UpsertTaskForOrgRef;

export function upsertTaskForOrg(vars: UpsertTaskForOrgVariables): MutationPromise<UpsertTaskForOrgData, UpsertTaskForOrgVariables>;
export function upsertTaskForOrg(dc: DataConnect, vars: UpsertTaskForOrgVariables): MutationPromise<UpsertTaskForOrgData, UpsertTaskForOrgVariables>;

interface DeleteTaskForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteTaskForOrgVariables): MutationRef<DeleteTaskForOrgData, DeleteTaskForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteTaskForOrgVariables): MutationRef<DeleteTaskForOrgData, DeleteTaskForOrgVariables>;
  operationName: string;
}
export const deleteTaskForOrgRef: DeleteTaskForOrgRef;

export function deleteTaskForOrg(vars: DeleteTaskForOrgVariables): MutationPromise<DeleteTaskForOrgData, DeleteTaskForOrgVariables>;
export function deleteTaskForOrg(dc: DataConnect, vars: DeleteTaskForOrgVariables): MutationPromise<DeleteTaskForOrgData, DeleteTaskForOrgVariables>;

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

interface InsertZoneWithRequiredVisitForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertZoneWithRequiredVisitForOrgVariables): MutationRef<InsertZoneWithRequiredVisitForOrgData, InsertZoneWithRequiredVisitForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertZoneWithRequiredVisitForOrgVariables): MutationRef<InsertZoneWithRequiredVisitForOrgData, InsertZoneWithRequiredVisitForOrgVariables>;
  operationName: string;
}
export const insertZoneWithRequiredVisitForOrgRef: InsertZoneWithRequiredVisitForOrgRef;

export function insertZoneWithRequiredVisitForOrg(vars: InsertZoneWithRequiredVisitForOrgVariables): MutationPromise<InsertZoneWithRequiredVisitForOrgData, InsertZoneWithRequiredVisitForOrgVariables>;
export function insertZoneWithRequiredVisitForOrg(dc: DataConnect, vars: InsertZoneWithRequiredVisitForOrgVariables): MutationPromise<InsertZoneWithRequiredVisitForOrgData, InsertZoneWithRequiredVisitForOrgVariables>;

interface UpdateZoneWithRequiredVisitForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateZoneWithRequiredVisitForOrgVariables): MutationRef<UpdateZoneWithRequiredVisitForOrgData, UpdateZoneWithRequiredVisitForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateZoneWithRequiredVisitForOrgVariables): MutationRef<UpdateZoneWithRequiredVisitForOrgData, UpdateZoneWithRequiredVisitForOrgVariables>;
  operationName: string;
}
export const updateZoneWithRequiredVisitForOrgRef: UpdateZoneWithRequiredVisitForOrgRef;

export function updateZoneWithRequiredVisitForOrg(vars: UpdateZoneWithRequiredVisitForOrgVariables): MutationPromise<UpdateZoneWithRequiredVisitForOrgData, UpdateZoneWithRequiredVisitForOrgVariables>;
export function updateZoneWithRequiredVisitForOrg(dc: DataConnect, vars: UpdateZoneWithRequiredVisitForOrgVariables): MutationPromise<UpdateZoneWithRequiredVisitForOrgData, UpdateZoneWithRequiredVisitForOrgVariables>;

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

interface ReidentifyEventForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: ReidentifyEventForOrgVariables): MutationRef<ReidentifyEventForOrgData, ReidentifyEventForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: ReidentifyEventForOrgVariables): MutationRef<ReidentifyEventForOrgData, ReidentifyEventForOrgVariables>;
  operationName: string;
}
export const reidentifyEventForOrgRef: ReidentifyEventForOrgRef;

export function reidentifyEventForOrg(vars: ReidentifyEventForOrgVariables): MutationPromise<ReidentifyEventForOrgData, ReidentifyEventForOrgVariables>;
export function reidentifyEventForOrg(dc: DataConnect, vars: ReidentifyEventForOrgVariables): MutationPromise<ReidentifyEventForOrgData, ReidentifyEventForOrgVariables>;

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

interface InsertBackupCycleForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertBackupCycleForOrgVariables): MutationRef<InsertBackupCycleForOrgData, InsertBackupCycleForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertBackupCycleForOrgVariables): MutationRef<InsertBackupCycleForOrgData, InsertBackupCycleForOrgVariables>;
  operationName: string;
}
export const insertBackupCycleForOrgRef: InsertBackupCycleForOrgRef;

export function insertBackupCycleForOrg(vars: InsertBackupCycleForOrgVariables): MutationPromise<InsertBackupCycleForOrgData, InsertBackupCycleForOrgVariables>;
export function insertBackupCycleForOrg(dc: DataConnect, vars: InsertBackupCycleForOrgVariables): MutationPromise<InsertBackupCycleForOrgData, InsertBackupCycleForOrgVariables>;

interface UpdateBackupCycleForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateBackupCycleForOrgVariables): MutationRef<UpdateBackupCycleForOrgData, UpdateBackupCycleForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateBackupCycleForOrgVariables): MutationRef<UpdateBackupCycleForOrgData, UpdateBackupCycleForOrgVariables>;
  operationName: string;
}
export const updateBackupCycleForOrgRef: UpdateBackupCycleForOrgRef;

export function updateBackupCycleForOrg(vars: UpdateBackupCycleForOrgVariables): MutationPromise<UpdateBackupCycleForOrgData, UpdateBackupCycleForOrgVariables>;
export function updateBackupCycleForOrg(dc: DataConnect, vars: UpdateBackupCycleForOrgVariables): MutationPromise<UpdateBackupCycleForOrgData, UpdateBackupCycleForOrgVariables>;

interface InsertStorageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertStorageForOrgVariables): MutationRef<InsertStorageForOrgData, InsertStorageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertStorageForOrgVariables): MutationRef<InsertStorageForOrgData, InsertStorageForOrgVariables>;
  operationName: string;
}
export const insertStorageForOrgRef: InsertStorageForOrgRef;

export function insertStorageForOrg(vars: InsertStorageForOrgVariables): MutationPromise<InsertStorageForOrgData, InsertStorageForOrgVariables>;
export function insertStorageForOrg(dc: DataConnect, vars: InsertStorageForOrgVariables): MutationPromise<InsertStorageForOrgData, InsertStorageForOrgVariables>;

interface UpdateStorageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateStorageForOrgVariables): MutationRef<UpdateStorageForOrgData, UpdateStorageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateStorageForOrgVariables): MutationRef<UpdateStorageForOrgData, UpdateStorageForOrgVariables>;
  operationName: string;
}
export const updateStorageForOrgRef: UpdateStorageForOrgRef;

export function updateStorageForOrg(vars: UpdateStorageForOrgVariables): MutationPromise<UpdateStorageForOrgData, UpdateStorageForOrgVariables>;
export function updateStorageForOrg(dc: DataConnect, vars: UpdateStorageForOrgVariables): MutationPromise<UpdateStorageForOrgData, UpdateStorageForOrgVariables>;

interface DeleteStorageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteStorageForOrgVariables): MutationRef<DeleteStorageForOrgData, DeleteStorageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteStorageForOrgVariables): MutationRef<DeleteStorageForOrgData, DeleteStorageForOrgVariables>;
  operationName: string;
}
export const deleteStorageForOrgRef: DeleteStorageForOrgRef;

export function deleteStorageForOrg(vars: DeleteStorageForOrgVariables): MutationPromise<DeleteStorageForOrgData, DeleteStorageForOrgVariables>;
export function deleteStorageForOrg(dc: DataConnect, vars: DeleteStorageForOrgVariables): MutationPromise<DeleteStorageForOrgData, DeleteStorageForOrgVariables>;

interface InsertClientStorageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertClientStorageForOrgVariables): MutationRef<InsertClientStorageForOrgData, InsertClientStorageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertClientStorageForOrgVariables): MutationRef<InsertClientStorageForOrgData, InsertClientStorageForOrgVariables>;
  operationName: string;
}
export const insertClientStorageForOrgRef: InsertClientStorageForOrgRef;

export function insertClientStorageForOrg(vars: InsertClientStorageForOrgVariables): MutationPromise<InsertClientStorageForOrgData, InsertClientStorageForOrgVariables>;
export function insertClientStorageForOrg(dc: DataConnect, vars: InsertClientStorageForOrgVariables): MutationPromise<InsertClientStorageForOrgData, InsertClientStorageForOrgVariables>;

interface UpdateClientStorageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateClientStorageForOrgVariables): MutationRef<UpdateClientStorageForOrgData, UpdateClientStorageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateClientStorageForOrgVariables): MutationRef<UpdateClientStorageForOrgData, UpdateClientStorageForOrgVariables>;
  operationName: string;
}
export const updateClientStorageForOrgRef: UpdateClientStorageForOrgRef;

export function updateClientStorageForOrg(vars: UpdateClientStorageForOrgVariables): MutationPromise<UpdateClientStorageForOrgData, UpdateClientStorageForOrgVariables>;
export function updateClientStorageForOrg(dc: DataConnect, vars: UpdateClientStorageForOrgVariables): MutationPromise<UpdateClientStorageForOrgData, UpdateClientStorageForOrgVariables>;

interface DeleteClientStorageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteClientStorageForOrgVariables): MutationRef<DeleteClientStorageForOrgData, DeleteClientStorageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteClientStorageForOrgVariables): MutationRef<DeleteClientStorageForOrgData, DeleteClientStorageForOrgVariables>;
  operationName: string;
}
export const deleteClientStorageForOrgRef: DeleteClientStorageForOrgRef;

export function deleteClientStorageForOrg(vars: DeleteClientStorageForOrgVariables): MutationPromise<DeleteClientStorageForOrgData, DeleteClientStorageForOrgVariables>;
export function deleteClientStorageForOrg(dc: DataConnect, vars: DeleteClientStorageForOrgVariables): MutationPromise<DeleteClientStorageForOrgData, DeleteClientStorageForOrgVariables>;

interface StartWorkdayPauseRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: StartWorkdayPauseVariables): MutationRef<StartWorkdayPauseData, StartWorkdayPauseVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: StartWorkdayPauseVariables): MutationRef<StartWorkdayPauseData, StartWorkdayPauseVariables>;
  operationName: string;
}
export const startWorkdayPauseRef: StartWorkdayPauseRef;

export function startWorkdayPause(vars: StartWorkdayPauseVariables): MutationPromise<StartWorkdayPauseData, StartWorkdayPauseVariables>;
export function startWorkdayPause(dc: DataConnect, vars: StartWorkdayPauseVariables): MutationPromise<StartWorkdayPauseData, StartWorkdayPauseVariables>;

interface StopWorkdayPauseRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: StopWorkdayPauseVariables): MutationRef<StopWorkdayPauseData, StopWorkdayPauseVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: StopWorkdayPauseVariables): MutationRef<StopWorkdayPauseData, StopWorkdayPauseVariables>;
  operationName: string;
}
export const stopWorkdayPauseRef: StopWorkdayPauseRef;

export function stopWorkdayPause(vars: StopWorkdayPauseVariables): MutationPromise<StopWorkdayPauseData, StopWorkdayPauseVariables>;
export function stopWorkdayPause(dc: DataConnect, vars: StopWorkdayPauseVariables): MutationPromise<StopWorkdayPauseData, StopWorkdayPauseVariables>;

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

interface CanManageWorkersForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CanManageWorkersForOrgVariables): QueryRef<CanManageWorkersForOrgData, CanManageWorkersForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CanManageWorkersForOrgVariables): QueryRef<CanManageWorkersForOrgData, CanManageWorkersForOrgVariables>;
  operationName: string;
}
export const canManageWorkersForOrgRef: CanManageWorkersForOrgRef;

export function canManageWorkersForOrg(vars: CanManageWorkersForOrgVariables): QueryPromise<CanManageWorkersForOrgData, CanManageWorkersForOrgVariables>;
export function canManageWorkersForOrg(dc: DataConnect, vars: CanManageWorkersForOrgVariables): QueryPromise<CanManageWorkersForOrgData, CanManageWorkersForOrgVariables>;

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

interface TasksForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: TasksForOrgVariables): QueryRef<TasksForOrgData, TasksForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: TasksForOrgVariables): QueryRef<TasksForOrgData, TasksForOrgVariables>;
  operationName: string;
}
export const tasksForOrgRef: TasksForOrgRef;

export function tasksForOrg(vars: TasksForOrgVariables): QueryPromise<TasksForOrgData, TasksForOrgVariables>;
export function tasksForOrg(dc: DataConnect, vars: TasksForOrgVariables): QueryPromise<TasksForOrgData, TasksForOrgVariables>;

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

interface WorkdaysPageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdaysPageForOrgVariables): QueryRef<WorkdaysPageForOrgData, WorkdaysPageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkdaysPageForOrgVariables): QueryRef<WorkdaysPageForOrgData, WorkdaysPageForOrgVariables>;
  operationName: string;
}
export const workdaysPageForOrgRef: WorkdaysPageForOrgRef;

export function workdaysPageForOrg(vars: WorkdaysPageForOrgVariables): QueryPromise<WorkdaysPageForOrgData, WorkdaysPageForOrgVariables>;
export function workdaysPageForOrg(dc: DataConnect, vars: WorkdaysPageForOrgVariables): QueryPromise<WorkdaysPageForOrgData, WorkdaysPageForOrgVariables>;

interface WorkdaysPageForOrgByBusinessDateRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdaysPageForOrgByBusinessDateVariables): QueryRef<WorkdaysPageForOrgByBusinessDateData, WorkdaysPageForOrgByBusinessDateVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkdaysPageForOrgByBusinessDateVariables): QueryRef<WorkdaysPageForOrgByBusinessDateData, WorkdaysPageForOrgByBusinessDateVariables>;
  operationName: string;
}
export const workdaysPageForOrgByBusinessDateRef: WorkdaysPageForOrgByBusinessDateRef;

export function workdaysPageForOrgByBusinessDate(vars: WorkdaysPageForOrgByBusinessDateVariables): QueryPromise<WorkdaysPageForOrgByBusinessDateData, WorkdaysPageForOrgByBusinessDateVariables>;
export function workdaysPageForOrgByBusinessDate(dc: DataConnect, vars: WorkdaysPageForOrgByBusinessDateVariables): QueryPromise<WorkdaysPageForOrgByBusinessDateData, WorkdaysPageForOrgByBusinessDateVariables>;

interface WorkdaysIntegrityPageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdaysIntegrityPageForOrgVariables): QueryRef<WorkdaysIntegrityPageForOrgData, WorkdaysIntegrityPageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkdaysIntegrityPageForOrgVariables): QueryRef<WorkdaysIntegrityPageForOrgData, WorkdaysIntegrityPageForOrgVariables>;
  operationName: string;
}
export const workdaysIntegrityPageForOrgRef: WorkdaysIntegrityPageForOrgRef;

export function workdaysIntegrityPageForOrg(vars: WorkdaysIntegrityPageForOrgVariables): QueryPromise<WorkdaysIntegrityPageForOrgData, WorkdaysIntegrityPageForOrgVariables>;
export function workdaysIntegrityPageForOrg(dc: DataConnect, vars: WorkdaysIntegrityPageForOrgVariables): QueryPromise<WorkdaysIntegrityPageForOrgData, WorkdaysIntegrityPageForOrgVariables>;

interface WorkdaysPageForOrgByWorkerRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdaysPageForOrgByWorkerVariables): QueryRef<WorkdaysPageForOrgByWorkerData, WorkdaysPageForOrgByWorkerVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkdaysPageForOrgByWorkerVariables): QueryRef<WorkdaysPageForOrgByWorkerData, WorkdaysPageForOrgByWorkerVariables>;
  operationName: string;
}
export const workdaysPageForOrgByWorkerRef: WorkdaysPageForOrgByWorkerRef;

export function workdaysPageForOrgByWorker(vars: WorkdaysPageForOrgByWorkerVariables): QueryPromise<WorkdaysPageForOrgByWorkerData, WorkdaysPageForOrgByWorkerVariables>;
export function workdaysPageForOrgByWorker(dc: DataConnect, vars: WorkdaysPageForOrgByWorkerVariables): QueryPromise<WorkdaysPageForOrgByWorkerData, WorkdaysPageForOrgByWorkerVariables>;

interface WorkdaysPageForOrgByWorkerAndStatusRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdaysPageForOrgByWorkerAndStatusVariables): QueryRef<WorkdaysPageForOrgByWorkerAndStatusData, WorkdaysPageForOrgByWorkerAndStatusVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkdaysPageForOrgByWorkerAndStatusVariables): QueryRef<WorkdaysPageForOrgByWorkerAndStatusData, WorkdaysPageForOrgByWorkerAndStatusVariables>;
  operationName: string;
}
export const workdaysPageForOrgByWorkerAndStatusRef: WorkdaysPageForOrgByWorkerAndStatusRef;

export function workdaysPageForOrgByWorkerAndStatus(vars: WorkdaysPageForOrgByWorkerAndStatusVariables): QueryPromise<WorkdaysPageForOrgByWorkerAndStatusData, WorkdaysPageForOrgByWorkerAndStatusVariables>;
export function workdaysPageForOrgByWorkerAndStatus(dc: DataConnect, vars: WorkdaysPageForOrgByWorkerAndStatusVariables): QueryPromise<WorkdaysPageForOrgByWorkerAndStatusData, WorkdaysPageForOrgByWorkerAndStatusVariables>;

interface WorkdaysPageForOrgByRoomRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdaysPageForOrgByRoomVariables): QueryRef<WorkdaysPageForOrgByRoomData, WorkdaysPageForOrgByRoomVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkdaysPageForOrgByRoomVariables): QueryRef<WorkdaysPageForOrgByRoomData, WorkdaysPageForOrgByRoomVariables>;
  operationName: string;
}
export const workdaysPageForOrgByRoomRef: WorkdaysPageForOrgByRoomRef;

export function workdaysPageForOrgByRoom(vars: WorkdaysPageForOrgByRoomVariables): QueryPromise<WorkdaysPageForOrgByRoomData, WorkdaysPageForOrgByRoomVariables>;
export function workdaysPageForOrgByRoom(dc: DataConnect, vars: WorkdaysPageForOrgByRoomVariables): QueryPromise<WorkdaysPageForOrgByRoomData, WorkdaysPageForOrgByRoomVariables>;

interface WorkdaysPageForOrgByStatusRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdaysPageForOrgByStatusVariables): QueryRef<WorkdaysPageForOrgByStatusData, WorkdaysPageForOrgByStatusVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkdaysPageForOrgByStatusVariables): QueryRef<WorkdaysPageForOrgByStatusData, WorkdaysPageForOrgByStatusVariables>;
  operationName: string;
}
export const workdaysPageForOrgByStatusRef: WorkdaysPageForOrgByStatusRef;

export function workdaysPageForOrgByStatus(vars: WorkdaysPageForOrgByStatusVariables): QueryPromise<WorkdaysPageForOrgByStatusData, WorkdaysPageForOrgByStatusVariables>;
export function workdaysPageForOrgByStatus(dc: DataConnect, vars: WorkdaysPageForOrgByStatusVariables): QueryPromise<WorkdaysPageForOrgByStatusData, WorkdaysPageForOrgByStatusVariables>;

interface WorkdaysFingerprintForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdaysFingerprintForOrgVariables): QueryRef<WorkdaysFingerprintForOrgData, WorkdaysFingerprintForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkdaysFingerprintForOrgVariables): QueryRef<WorkdaysFingerprintForOrgData, WorkdaysFingerprintForOrgVariables>;
  operationName: string;
}
export const workdaysFingerprintForOrgRef: WorkdaysFingerprintForOrgRef;

export function workdaysFingerprintForOrg(vars: WorkdaysFingerprintForOrgVariables): QueryPromise<WorkdaysFingerprintForOrgData, WorkdaysFingerprintForOrgVariables>;
export function workdaysFingerprintForOrg(dc: DataConnect, vars: WorkdaysFingerprintForOrgVariables): QueryPromise<WorkdaysFingerprintForOrgData, WorkdaysFingerprintForOrgVariables>;

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

interface EventsIntegrityPageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: EventsIntegrityPageForOrgVariables): QueryRef<EventsIntegrityPageForOrgData, EventsIntegrityPageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: EventsIntegrityPageForOrgVariables): QueryRef<EventsIntegrityPageForOrgData, EventsIntegrityPageForOrgVariables>;
  operationName: string;
}
export const eventsIntegrityPageForOrgRef: EventsIntegrityPageForOrgRef;

export function eventsIntegrityPageForOrg(vars: EventsIntegrityPageForOrgVariables): QueryPromise<EventsIntegrityPageForOrgData, EventsIntegrityPageForOrgVariables>;
export function eventsIntegrityPageForOrg(dc: DataConnect, vars: EventsIntegrityPageForOrgVariables): QueryPromise<EventsIntegrityPageForOrgData, EventsIntegrityPageForOrgVariables>;

interface EventsPageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: EventsPageForOrgVariables): QueryRef<EventsPageForOrgData, EventsPageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: EventsPageForOrgVariables): QueryRef<EventsPageForOrgData, EventsPageForOrgVariables>;
  operationName: string;
}
export const eventsPageForOrgRef: EventsPageForOrgRef;

export function eventsPageForOrg(vars: EventsPageForOrgVariables): QueryPromise<EventsPageForOrgData, EventsPageForOrgVariables>;
export function eventsPageForOrg(dc: DataConnect, vars: EventsPageForOrgVariables): QueryPromise<EventsPageForOrgData, EventsPageForOrgVariables>;

interface EventsPageForOrgByWorkerRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: EventsPageForOrgByWorkerVariables): QueryRef<EventsPageForOrgByWorkerData, EventsPageForOrgByWorkerVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: EventsPageForOrgByWorkerVariables): QueryRef<EventsPageForOrgByWorkerData, EventsPageForOrgByWorkerVariables>;
  operationName: string;
}
export const eventsPageForOrgByWorkerRef: EventsPageForOrgByWorkerRef;

export function eventsPageForOrgByWorker(vars: EventsPageForOrgByWorkerVariables): QueryPromise<EventsPageForOrgByWorkerData, EventsPageForOrgByWorkerVariables>;
export function eventsPageForOrgByWorker(dc: DataConnect, vars: EventsPageForOrgByWorkerVariables): QueryPromise<EventsPageForOrgByWorkerData, EventsPageForOrgByWorkerVariables>;

interface EventsPageForOrgByZoneRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: EventsPageForOrgByZoneVariables): QueryRef<EventsPageForOrgByZoneData, EventsPageForOrgByZoneVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: EventsPageForOrgByZoneVariables): QueryRef<EventsPageForOrgByZoneData, EventsPageForOrgByZoneVariables>;
  operationName: string;
}
export const eventsPageForOrgByZoneRef: EventsPageForOrgByZoneRef;

export function eventsPageForOrgByZone(vars: EventsPageForOrgByZoneVariables): QueryPromise<EventsPageForOrgByZoneData, EventsPageForOrgByZoneVariables>;
export function eventsPageForOrgByZone(dc: DataConnect, vars: EventsPageForOrgByZoneVariables): QueryPromise<EventsPageForOrgByZoneData, EventsPageForOrgByZoneVariables>;

interface EventsPageForOrgByStatusRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: EventsPageForOrgByStatusVariables): QueryRef<EventsPageForOrgByStatusData, EventsPageForOrgByStatusVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: EventsPageForOrgByStatusVariables): QueryRef<EventsPageForOrgByStatusData, EventsPageForOrgByStatusVariables>;
  operationName: string;
}
export const eventsPageForOrgByStatusRef: EventsPageForOrgByStatusRef;

export function eventsPageForOrgByStatus(vars: EventsPageForOrgByStatusVariables): QueryPromise<EventsPageForOrgByStatusData, EventsPageForOrgByStatusVariables>;
export function eventsPageForOrgByStatus(dc: DataConnect, vars: EventsPageForOrgByStatusVariables): QueryPromise<EventsPageForOrgByStatusData, EventsPageForOrgByStatusVariables>;

interface EventsPageForOrgByTaskOccurrenceRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: EventsPageForOrgByTaskOccurrenceVariables): QueryRef<EventsPageForOrgByTaskOccurrenceData, EventsPageForOrgByTaskOccurrenceVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: EventsPageForOrgByTaskOccurrenceVariables): QueryRef<EventsPageForOrgByTaskOccurrenceData, EventsPageForOrgByTaskOccurrenceVariables>;
  operationName: string;
}
export const eventsPageForOrgByTaskOccurrenceRef: EventsPageForOrgByTaskOccurrenceRef;

export function eventsPageForOrgByTaskOccurrence(vars: EventsPageForOrgByTaskOccurrenceVariables): QueryPromise<EventsPageForOrgByTaskOccurrenceData, EventsPageForOrgByTaskOccurrenceVariables>;
export function eventsPageForOrgByTaskOccurrence(dc: DataConnect, vars: EventsPageForOrgByTaskOccurrenceVariables): QueryPromise<EventsPageForOrgByTaskOccurrenceData, EventsPageForOrgByTaskOccurrenceVariables>;

interface EventsPageForOrgByPlanMatchStatusRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: EventsPageForOrgByPlanMatchStatusVariables): QueryRef<EventsPageForOrgByPlanMatchStatusData, EventsPageForOrgByPlanMatchStatusVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: EventsPageForOrgByPlanMatchStatusVariables): QueryRef<EventsPageForOrgByPlanMatchStatusData, EventsPageForOrgByPlanMatchStatusVariables>;
  operationName: string;
}
export const eventsPageForOrgByPlanMatchStatusRef: EventsPageForOrgByPlanMatchStatusRef;

export function eventsPageForOrgByPlanMatchStatus(vars: EventsPageForOrgByPlanMatchStatusVariables): QueryPromise<EventsPageForOrgByPlanMatchStatusData, EventsPageForOrgByPlanMatchStatusVariables>;
export function eventsPageForOrgByPlanMatchStatus(dc: DataConnect, vars: EventsPageForOrgByPlanMatchStatusVariables): QueryPromise<EventsPageForOrgByPlanMatchStatusData, EventsPageForOrgByPlanMatchStatusVariables>;

interface EventsFingerprintForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: EventsFingerprintForOrgVariables): QueryRef<EventsFingerprintForOrgData, EventsFingerprintForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: EventsFingerprintForOrgVariables): QueryRef<EventsFingerprintForOrgData, EventsFingerprintForOrgVariables>;
  operationName: string;
}
export const eventsFingerprintForOrgRef: EventsFingerprintForOrgRef;

export function eventsFingerprintForOrg(vars: EventsFingerprintForOrgVariables): QueryPromise<EventsFingerprintForOrgData, EventsFingerprintForOrgVariables>;
export function eventsFingerprintForOrg(dc: DataConnect, vars: EventsFingerprintForOrgVariables): QueryPromise<EventsFingerprintForOrgData, EventsFingerprintForOrgVariables>;

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

interface StorageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: StorageForOrgVariables): QueryRef<StorageForOrgData, StorageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: StorageForOrgVariables): QueryRef<StorageForOrgData, StorageForOrgVariables>;
  operationName: string;
}
export const storageForOrgRef: StorageForOrgRef;

export function storageForOrg(vars: StorageForOrgVariables): QueryPromise<StorageForOrgData, StorageForOrgVariables>;
export function storageForOrg(dc: DataConnect, vars: StorageForOrgVariables): QueryPromise<StorageForOrgData, StorageForOrgVariables>;

interface ClientStorageForClientRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: ClientStorageForClientVariables): QueryRef<ClientStorageForClientData, ClientStorageForClientVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: ClientStorageForClientVariables): QueryRef<ClientStorageForClientData, ClientStorageForClientVariables>;
  operationName: string;
}
export const clientStorageForClientRef: ClientStorageForClientRef;

export function clientStorageForClient(vars: ClientStorageForClientVariables): QueryPromise<ClientStorageForClientData, ClientStorageForClientVariables>;
export function clientStorageForClient(dc: DataConnect, vars: ClientStorageForClientVariables): QueryPromise<ClientStorageForClientData, ClientStorageForClientVariables>;

interface ClientStorageForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: ClientStorageForOrgVariables): QueryRef<ClientStorageForOrgData, ClientStorageForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: ClientStorageForOrgVariables): QueryRef<ClientStorageForOrgData, ClientStorageForOrgVariables>;
  operationName: string;
}
export const clientStorageForOrgRef: ClientStorageForOrgRef;

export function clientStorageForOrg(vars: ClientStorageForOrgVariables): QueryPromise<ClientStorageForOrgData, ClientStorageForOrgVariables>;
export function clientStorageForOrg(dc: DataConnect, vars: ClientStorageForOrgVariables): QueryPromise<ClientStorageForOrgData, ClientStorageForOrgVariables>;

interface WorkdayPausesForOrgRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdayPausesForOrgVariables): QueryRef<WorkdayPausesForOrgData, WorkdayPausesForOrgVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: WorkdayPausesForOrgVariables): QueryRef<WorkdayPausesForOrgData, WorkdayPausesForOrgVariables>;
  operationName: string;
}
export const workdayPausesForOrgRef: WorkdayPausesForOrgRef;

export function workdayPausesForOrg(vars: WorkdayPausesForOrgVariables): QueryPromise<WorkdayPausesForOrgData, WorkdayPausesForOrgVariables>;
export function workdayPausesForOrg(dc: DataConnect, vars: WorkdayPausesForOrgVariables): QueryPromise<WorkdayPausesForOrgData, WorkdayPausesForOrgVariables>;

interface ActiveWorkdayPauseForWorkerRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: ActiveWorkdayPauseForWorkerVariables): QueryRef<ActiveWorkdayPauseForWorkerData, ActiveWorkdayPauseForWorkerVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: ActiveWorkdayPauseForWorkerVariables): QueryRef<ActiveWorkdayPauseForWorkerData, ActiveWorkdayPauseForWorkerVariables>;
  operationName: string;
}
export const activeWorkdayPauseForWorkerRef: ActiveWorkdayPauseForWorkerRef;

export function activeWorkdayPauseForWorker(vars: ActiveWorkdayPauseForWorkerVariables): QueryPromise<ActiveWorkdayPauseForWorkerData, ActiveWorkdayPauseForWorkerVariables>;
export function activeWorkdayPauseForWorker(dc: DataConnect, vars: ActiveWorkdayPauseForWorkerVariables): QueryPromise<ActiveWorkdayPauseForWorkerData, ActiveWorkdayPauseForWorkerVariables>;

