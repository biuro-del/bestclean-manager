import { WorkersPageForOrgData, WorkersPageForOrgVariables, WorkerForOrgByLoginData, WorkerForOrgByLoginVariables, ClientsPageForOrgData, ClientsPageForOrgVariables, ZonesPageForOrgData, ZonesPageForOrgVariables, BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables, WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useWorkersPageForOrg(vars: WorkersPageForOrgVariables, options?: useDataConnectQueryOptions<WorkersPageForOrgData>): UseDataConnectQueryResult<WorkersPageForOrgData, WorkersPageForOrgVariables>;
export function useWorkersPageForOrg(dc: DataConnect, vars: WorkersPageForOrgVariables, options?: useDataConnectQueryOptions<WorkersPageForOrgData>): UseDataConnectQueryResult<WorkersPageForOrgData, WorkersPageForOrgVariables>;

export function useWorkerForOrgByLogin(vars: WorkerForOrgByLoginVariables, options?: useDataConnectQueryOptions<WorkerForOrgByLoginData>): UseDataConnectQueryResult<WorkerForOrgByLoginData, WorkerForOrgByLoginVariables>;
export function useWorkerForOrgByLogin(dc: DataConnect, vars: WorkerForOrgByLoginVariables, options?: useDataConnectQueryOptions<WorkerForOrgByLoginData>): UseDataConnectQueryResult<WorkerForOrgByLoginData, WorkerForOrgByLoginVariables>;

export function useClientsPageForOrg(vars: ClientsPageForOrgVariables, options?: useDataConnectQueryOptions<ClientsPageForOrgData>): UseDataConnectQueryResult<ClientsPageForOrgData, ClientsPageForOrgVariables>;
export function useClientsPageForOrg(dc: DataConnect, vars: ClientsPageForOrgVariables, options?: useDataConnectQueryOptions<ClientsPageForOrgData>): UseDataConnectQueryResult<ClientsPageForOrgData, ClientsPageForOrgVariables>;

export function useZonesPageForOrg(vars: ZonesPageForOrgVariables, options?: useDataConnectQueryOptions<ZonesPageForOrgData>): UseDataConnectQueryResult<ZonesPageForOrgData, ZonesPageForOrgVariables>;
export function useZonesPageForOrg(dc: DataConnect, vars: ZonesPageForOrgVariables, options?: useDataConnectQueryOptions<ZonesPageForOrgData>): UseDataConnectQueryResult<ZonesPageForOrgData, ZonesPageForOrgVariables>;

export function useBackupCyclesPageForOrg(vars: BackupCyclesPageForOrgVariables, options?: useDataConnectQueryOptions<BackupCyclesPageForOrgData>): UseDataConnectQueryResult<BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables>;
export function useBackupCyclesPageForOrg(dc: DataConnect, vars: BackupCyclesPageForOrgVariables, options?: useDataConnectQueryOptions<BackupCyclesPageForOrgData>): UseDataConnectQueryResult<BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables>;

export function useWorkdayPausesPageForOrg(vars: WorkdayPausesPageForOrgVariables, options?: useDataConnectQueryOptions<WorkdayPausesPageForOrgData>): UseDataConnectQueryResult<WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables>;
export function useWorkdayPausesPageForOrg(dc: DataConnect, vars: WorkdayPausesPageForOrgVariables, options?: useDataConnectQueryOptions<WorkdayPausesPageForOrgData>): UseDataConnectQueryResult<WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables>;
