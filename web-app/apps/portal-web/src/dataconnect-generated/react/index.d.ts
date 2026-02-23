import { InsertWorkerForOrgData, InsertWorkerForOrgVariables, InsertClientForOrgData, InsertClientForOrgVariables, UpdateClientForOrgData, UpdateClientForOrgVariables, DeleteClientForOrgData, DeleteClientForOrgVariables, InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables, UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables, DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables, InsertZoneForOrgData, InsertZoneForOrgVariables, UpdateZoneForOrgData, UpdateZoneForOrgVariables, DeleteZoneForOrgData, DeleteZoneForOrgVariables, InsertWorkdayForOrgData, InsertWorkdayForOrgVariables, UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables, DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables, InsertEventForOrgData, InsertEventForOrgVariables, UpdateEventForOrgData, UpdateEventForOrgVariables, DeleteEventForOrgData, DeleteEventForOrgVariables, MyOrganizationsData, WorkersForOrgData, WorkersForOrgVariables, ClientsForOrgData, ClientsForOrgVariables, IndividualJobsForOrgData, IndividualJobsForOrgVariables, ZonesForOrgData, ZonesForOrgVariables, WorkdaysForOrgData, WorkdaysForOrgVariables, BackupCyclesForOrgData, BackupCyclesForOrgVariables, EventsForOrgData, EventsForOrgVariables, WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useInsertWorkerForOrg(options?: useDataConnectMutationOptions<InsertWorkerForOrgData, FirebaseError, InsertWorkerForOrgVariables>): UseDataConnectMutationResult<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;
export function useInsertWorkerForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertWorkerForOrgData, FirebaseError, InsertWorkerForOrgVariables>): UseDataConnectMutationResult<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;

export function useInsertClientForOrg(options?: useDataConnectMutationOptions<InsertClientForOrgData, FirebaseError, InsertClientForOrgVariables>): UseDataConnectMutationResult<InsertClientForOrgData, InsertClientForOrgVariables>;
export function useInsertClientForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertClientForOrgData, FirebaseError, InsertClientForOrgVariables>): UseDataConnectMutationResult<InsertClientForOrgData, InsertClientForOrgVariables>;

export function useUpdateClientForOrg(options?: useDataConnectMutationOptions<UpdateClientForOrgData, FirebaseError, UpdateClientForOrgVariables>): UseDataConnectMutationResult<UpdateClientForOrgData, UpdateClientForOrgVariables>;
export function useUpdateClientForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateClientForOrgData, FirebaseError, UpdateClientForOrgVariables>): UseDataConnectMutationResult<UpdateClientForOrgData, UpdateClientForOrgVariables>;

export function useDeleteClientForOrg(options?: useDataConnectMutationOptions<DeleteClientForOrgData, FirebaseError, DeleteClientForOrgVariables>): UseDataConnectMutationResult<DeleteClientForOrgData, DeleteClientForOrgVariables>;
export function useDeleteClientForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteClientForOrgData, FirebaseError, DeleteClientForOrgVariables>): UseDataConnectMutationResult<DeleteClientForOrgData, DeleteClientForOrgVariables>;

export function useInsertIndividualJobForOrg(options?: useDataConnectMutationOptions<InsertIndividualJobForOrgData, FirebaseError, InsertIndividualJobForOrgVariables>): UseDataConnectMutationResult<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;
export function useInsertIndividualJobForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertIndividualJobForOrgData, FirebaseError, InsertIndividualJobForOrgVariables>): UseDataConnectMutationResult<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;

export function useUpdateIndividualJobForOrg(options?: useDataConnectMutationOptions<UpdateIndividualJobForOrgData, FirebaseError, UpdateIndividualJobForOrgVariables>): UseDataConnectMutationResult<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;
export function useUpdateIndividualJobForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateIndividualJobForOrgData, FirebaseError, UpdateIndividualJobForOrgVariables>): UseDataConnectMutationResult<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;

export function useDeleteIndividualJobForOrg(options?: useDataConnectMutationOptions<DeleteIndividualJobForOrgData, FirebaseError, DeleteIndividualJobForOrgVariables>): UseDataConnectMutationResult<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;
export function useDeleteIndividualJobForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteIndividualJobForOrgData, FirebaseError, DeleteIndividualJobForOrgVariables>): UseDataConnectMutationResult<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;

export function useInsertZoneForOrg(options?: useDataConnectMutationOptions<InsertZoneForOrgData, FirebaseError, InsertZoneForOrgVariables>): UseDataConnectMutationResult<InsertZoneForOrgData, InsertZoneForOrgVariables>;
export function useInsertZoneForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertZoneForOrgData, FirebaseError, InsertZoneForOrgVariables>): UseDataConnectMutationResult<InsertZoneForOrgData, InsertZoneForOrgVariables>;

export function useUpdateZoneForOrg(options?: useDataConnectMutationOptions<UpdateZoneForOrgData, FirebaseError, UpdateZoneForOrgVariables>): UseDataConnectMutationResult<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;
export function useUpdateZoneForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateZoneForOrgData, FirebaseError, UpdateZoneForOrgVariables>): UseDataConnectMutationResult<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;

export function useDeleteZoneForOrg(options?: useDataConnectMutationOptions<DeleteZoneForOrgData, FirebaseError, DeleteZoneForOrgVariables>): UseDataConnectMutationResult<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;
export function useDeleteZoneForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteZoneForOrgData, FirebaseError, DeleteZoneForOrgVariables>): UseDataConnectMutationResult<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;

export function useInsertWorkdayForOrg(options?: useDataConnectMutationOptions<InsertWorkdayForOrgData, FirebaseError, InsertWorkdayForOrgVariables>): UseDataConnectMutationResult<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;
export function useInsertWorkdayForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertWorkdayForOrgData, FirebaseError, InsertWorkdayForOrgVariables>): UseDataConnectMutationResult<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;

export function useUpdateWorkdayForOrg(options?: useDataConnectMutationOptions<UpdateWorkdayForOrgData, FirebaseError, UpdateWorkdayForOrgVariables>): UseDataConnectMutationResult<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;
export function useUpdateWorkdayForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateWorkdayForOrgData, FirebaseError, UpdateWorkdayForOrgVariables>): UseDataConnectMutationResult<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;

export function useDeleteWorkdayForOrg(options?: useDataConnectMutationOptions<DeleteWorkdayForOrgData, FirebaseError, DeleteWorkdayForOrgVariables>): UseDataConnectMutationResult<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;
export function useDeleteWorkdayForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteWorkdayForOrgData, FirebaseError, DeleteWorkdayForOrgVariables>): UseDataConnectMutationResult<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;

export function useInsertEventForOrg(options?: useDataConnectMutationOptions<InsertEventForOrgData, FirebaseError, InsertEventForOrgVariables>): UseDataConnectMutationResult<InsertEventForOrgData, InsertEventForOrgVariables>;
export function useInsertEventForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertEventForOrgData, FirebaseError, InsertEventForOrgVariables>): UseDataConnectMutationResult<InsertEventForOrgData, InsertEventForOrgVariables>;

export function useUpdateEventForOrg(options?: useDataConnectMutationOptions<UpdateEventForOrgData, FirebaseError, UpdateEventForOrgVariables>): UseDataConnectMutationResult<UpdateEventForOrgData, UpdateEventForOrgVariables>;
export function useUpdateEventForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateEventForOrgData, FirebaseError, UpdateEventForOrgVariables>): UseDataConnectMutationResult<UpdateEventForOrgData, UpdateEventForOrgVariables>;

export function useDeleteEventForOrg(options?: useDataConnectMutationOptions<DeleteEventForOrgData, FirebaseError, DeleteEventForOrgVariables>): UseDataConnectMutationResult<DeleteEventForOrgData, DeleteEventForOrgVariables>;
export function useDeleteEventForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteEventForOrgData, FirebaseError, DeleteEventForOrgVariables>): UseDataConnectMutationResult<DeleteEventForOrgData, DeleteEventForOrgVariables>;

export function useMyOrganizations(options?: useDataConnectQueryOptions<MyOrganizationsData>): UseDataConnectQueryResult<MyOrganizationsData, undefined>;
export function useMyOrganizations(dc: DataConnect, options?: useDataConnectQueryOptions<MyOrganizationsData>): UseDataConnectQueryResult<MyOrganizationsData, undefined>;

export function useWorkersForOrg(vars: WorkersForOrgVariables, options?: useDataConnectQueryOptions<WorkersForOrgData>): UseDataConnectQueryResult<WorkersForOrgData, WorkersForOrgVariables>;
export function useWorkersForOrg(dc: DataConnect, vars: WorkersForOrgVariables, options?: useDataConnectQueryOptions<WorkersForOrgData>): UseDataConnectQueryResult<WorkersForOrgData, WorkersForOrgVariables>;

export function useClientsForOrg(vars: ClientsForOrgVariables, options?: useDataConnectQueryOptions<ClientsForOrgData>): UseDataConnectQueryResult<ClientsForOrgData, ClientsForOrgVariables>;
export function useClientsForOrg(dc: DataConnect, vars: ClientsForOrgVariables, options?: useDataConnectQueryOptions<ClientsForOrgData>): UseDataConnectQueryResult<ClientsForOrgData, ClientsForOrgVariables>;

export function useIndividualJobsForOrg(vars: IndividualJobsForOrgVariables, options?: useDataConnectQueryOptions<IndividualJobsForOrgData>): UseDataConnectQueryResult<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;
export function useIndividualJobsForOrg(dc: DataConnect, vars: IndividualJobsForOrgVariables, options?: useDataConnectQueryOptions<IndividualJobsForOrgData>): UseDataConnectQueryResult<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;

export function useZonesForOrg(vars: ZonesForOrgVariables, options?: useDataConnectQueryOptions<ZonesForOrgData>): UseDataConnectQueryResult<ZonesForOrgData, ZonesForOrgVariables>;
export function useZonesForOrg(dc: DataConnect, vars: ZonesForOrgVariables, options?: useDataConnectQueryOptions<ZonesForOrgData>): UseDataConnectQueryResult<ZonesForOrgData, ZonesForOrgVariables>;

export function useWorkdaysForOrg(vars: WorkdaysForOrgVariables, options?: useDataConnectQueryOptions<WorkdaysForOrgData>): UseDataConnectQueryResult<WorkdaysForOrgData, WorkdaysForOrgVariables>;
export function useWorkdaysForOrg(dc: DataConnect, vars: WorkdaysForOrgVariables, options?: useDataConnectQueryOptions<WorkdaysForOrgData>): UseDataConnectQueryResult<WorkdaysForOrgData, WorkdaysForOrgVariables>;

export function useBackupCyclesForOrg(vars: BackupCyclesForOrgVariables, options?: useDataConnectQueryOptions<BackupCyclesForOrgData>): UseDataConnectQueryResult<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;
export function useBackupCyclesForOrg(dc: DataConnect, vars: BackupCyclesForOrgVariables, options?: useDataConnectQueryOptions<BackupCyclesForOrgData>): UseDataConnectQueryResult<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;

export function useEventsForOrg(vars: EventsForOrgVariables, options?: useDataConnectQueryOptions<EventsForOrgData>): UseDataConnectQueryResult<EventsForOrgData, EventsForOrgVariables>;
export function useEventsForOrg(dc: DataConnect, vars: EventsForOrgVariables, options?: useDataConnectQueryOptions<EventsForOrgData>): UseDataConnectQueryResult<EventsForOrgData, EventsForOrgVariables>;

export function useWorkerWorkdaysForOrg(vars: WorkerWorkdaysForOrgVariables, options?: useDataConnectQueryOptions<WorkerWorkdaysForOrgData>): UseDataConnectQueryResult<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;
export function useWorkerWorkdaysForOrg(dc: DataConnect, vars: WorkerWorkdaysForOrgVariables, options?: useDataConnectQueryOptions<WorkerWorkdaysForOrgData>): UseDataConnectQueryResult<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;
