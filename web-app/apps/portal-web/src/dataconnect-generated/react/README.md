# Generated React README
This README will guide you through the process of using the generated React SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `JavaScript README`, you can find it at [`dataconnect-generated/README.md`](../README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

You can use this generated SDK by importing from the package `@dataconnect/generated/react` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#react).

# Table of Contents
- [**Overview**](#generated-react-readme)
- [**TanStack Query Firebase & TanStack React Query**](#tanstack-query-firebase-tanstack-react-query)
  - [*Package Installation*](#installing-tanstack-query-firebase-and-tanstack-react-query-packages)
  - [*Configuring TanStack Query*](#configuring-tanstack-query)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*MyOrganizations*](#myorganizations)
  - [*CanManageWorkersForOrg*](#canmanageworkersfororg)
  - [*WorkersForOrg*](#workersfororg)
  - [*ClientsForOrg*](#clientsfororg)
  - [*IndividualJobsForOrg*](#individualjobsfororg)
  - [*TasksForOrg*](#tasksfororg)
  - [*ZonesForOrg*](#zonesfororg)
  - [*WorkdaysForOrg*](#workdaysfororg)
  - [*WorkdaysPageForOrg*](#workdayspagefororg)
  - [*WorkdaysPageForOrgByBusinessDate*](#workdayspagefororgbybusinessdate)
  - [*WorkdaysIntegrityPageForOrg*](#workdaysintegritypagefororg)
  - [*WorkdaysPageForOrgByWorker*](#workdayspagefororgbyworker)
  - [*WorkdaysPageForOrgByWorkerAndStatus*](#workdayspagefororgbyworkerandstatus)
  - [*WorkdaysPageForOrgByRoom*](#workdayspagefororgbyroom)
  - [*WorkdaysPageForOrgByStatus*](#workdayspagefororgbystatus)
  - [*WorkdaysFingerprintForOrg*](#workdaysfingerprintfororg)
  - [*BackupCyclesForOrg*](#backupcyclesfororg)
  - [*EventsForOrg*](#eventsfororg)
  - [*EventsIntegrityPageForOrg*](#eventsintegritypagefororg)
  - [*EventsPageForOrg*](#eventspagefororg)
  - [*EventsPageForOrgByWorker*](#eventspagefororgbyworker)
  - [*EventsPageForOrgByZone*](#eventspagefororgbyzone)
  - [*EventsPageForOrgByStatus*](#eventspagefororgbystatus)
  - [*EventsPageForOrgByTaskOccurrence*](#eventspagefororgbytaskoccurrence)
  - [*EventsPageForOrgByPlanMatchStatus*](#eventspagefororgbyplanmatchstatus)
  - [*EventsFingerprintForOrg*](#eventsfingerprintfororg)
  - [*WorkerWorkdaysForOrg*](#workerworkdaysfororg)
  - [*StorageForOrg*](#storagefororg)
  - [*ClientStorageForClient*](#clientstorageforclient)
  - [*ClientStorageForOrg*](#clientstoragefororg)
  - [*WorkdayPausesForOrg*](#workdaypausesfororg)
  - [*ActiveWorkdayPauseForWorker*](#activeworkdaypauseforworker)
- [**Mutations**](#mutations)
  - [*InsertClientForOrg*](#insertclientfororg)
  - [*UpdateClientForOrg*](#updateclientfororg)
  - [*DeleteClientForOrg*](#deleteclientfororg)
  - [*InsertIndividualJobForOrg*](#insertindividualjobfororg)
  - [*UpdateIndividualJobForOrg*](#updateindividualjobfororg)
  - [*DeleteIndividualJobForOrg*](#deleteindividualjobfororg)
  - [*UpsertTaskForOrg*](#upserttaskfororg)
  - [*DeleteTaskForOrg*](#deletetaskfororg)
  - [*InsertZoneForOrg*](#insertzonefororg)
  - [*UpdateZoneForOrg*](#updatezonefororg)
  - [*DeleteZoneForOrg*](#deletezonefororg)
  - [*InsertWorkdayForOrg*](#insertworkdayfororg)
  - [*UpdateWorkdayForOrg*](#updateworkdayfororg)
  - [*DeleteWorkdayForOrg*](#deleteworkdayfororg)
  - [*InsertEventForOrg*](#inserteventfororg)
  - [*UpdateEventForOrg*](#updateeventfororg)
  - [*ReidentifyEventForOrg*](#reidentifyeventfororg)
  - [*DeleteEventForOrg*](#deleteeventfororg)
  - [*InsertBackupCycleForOrg*](#insertbackupcyclefororg)
  - [*UpdateBackupCycleForOrg*](#updatebackupcyclefororg)
  - [*InsertStorageForOrg*](#insertstoragefororg)
  - [*UpdateStorageForOrg*](#updatestoragefororg)
  - [*DeleteStorageForOrg*](#deletestoragefororg)
  - [*InsertClientStorageForOrg*](#insertclientstoragefororg)
  - [*UpdateClientStorageForOrg*](#updateclientstoragefororg)
  - [*DeleteClientStorageForOrg*](#deleteclientstoragefororg)
  - [*StartWorkdayPause*](#startworkdaypause)
  - [*StopWorkdayPause*](#stopworkdaypause)

# TanStack Query Firebase & TanStack React Query
This SDK provides [React](https://react.dev/) hooks generated specific to your application, for the operations found in the connector `example`. These hooks are generated using [TanStack Query Firebase](https://react-query-firebase.invertase.dev/) by our partners at Invertase, a library built on top of [TanStack React Query v5](https://tanstack.com/query/v5/docs/framework/react/overview).

***You do not need to be familiar with Tanstack Query or Tanstack Query Firebase to use this SDK.*** However, you may find it useful to learn more about them, as they will empower you as a user of this Generated React SDK.

## Installing TanStack Query Firebase and TanStack React Query Packages
In order to use the React generated SDK, you must install the `TanStack React Query` and `TanStack Query Firebase` packages.
```bash
npm i --save @tanstack/react-query @tanstack-query-firebase/react
```
```bash
npm i --save firebase@latest # Note: React has a peer dependency on ^11.3.0
```

You can also follow the installation instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#tanstack-install), or the [TanStack Query Firebase documentation](https://react-query-firebase.invertase.dev/react) and [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/installation).

## Configuring TanStack Query
In order to use the React generated SDK in your application, you must wrap your application's component tree in a `QueryClientProvider` component from TanStack React Query. None of your generated React SDK hooks will work without this provider.

```javascript
import { QueryClientProvider } from '@tanstack/react-query';

// Create a TanStack Query client instance
const queryClient = new QueryClient()

function App() {
  return (
    // Provide the client to your App
    <QueryClientProvider client={queryClient}>
      <MyApplication />
    </QueryClientProvider>
  )
}
```

To learn more about `QueryClientProvider`, see the [TanStack React Query documentation](https://tanstack.com/query/latest/docs/framework/react/quick-start) and the [TanStack Query Firebase documentation](https://invertase.docs.page/tanstack-query-firebase/react#usage).

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`.

You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#emulator-react-angular).

```javascript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) using the hooks provided from your generated React SDK.

# Queries

The React generated SDK provides Query hook functions that call and return [`useDataConnectQuery`](https://react-query-firebase.invertase.dev/react/data-connect/querying) hooks from TanStack Query Firebase.

Calling these hook functions will return a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and the most recent data returned by the Query, among other things. To learn more about these hooks and how to use them, see the [TanStack Query Firebase documentation](https://react-query-firebase.invertase.dev/react/data-connect/querying).

TanStack React Query caches the results of your Queries, so using the same Query hook function in multiple places in your application allows the entire application to automatically see updates to that Query's data.

Query hooks execute their Queries automatically when called, and periodically refresh, unless you change the `queryOptions` for the Query. To learn how to stop a Query from automatically executing, including how to make a query "lazy", see the [TanStack React Query documentation](https://tanstack.com/query/latest/docs/framework/react/guides/disabling-queries).

To learn more about TanStack React Query's Queries, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/guides/queries).

## Using Query Hooks
Here's a general overview of how to use the generated Query hooks in your code:

- If the Query has no variables, the Query hook function does not require arguments.
- If the Query has any required variables, the Query hook function will require at least one argument: an object that contains all the required variables for the Query.
- If the Query has some required and some optional variables, only required variables are necessary in the variables argument object, and optional variables may be provided as well.
- If all of the Query's variables are optional, the Query hook function does not require any arguments.
- Query hook functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.
- Query hooks functions can be called with or without passing in an `options` argument of type `useDataConnectQueryOptions`. To learn more about the `options` argument, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/guides/query-options).
  - ***Special case:***  If the Query has all optional variables and you would like to provide an `options` argument to the Query hook function without providing any variables, you must pass `undefined` where you would normally pass the Query's variables, and then may provide the `options` argument.

Below are examples of how to use the `example` connector's generated Query hook functions to execute each Query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#operations-react-angular).

## MyOrganizations
You can execute the `MyOrganizations` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useMyOrganizations(dc: DataConnect, options?: useDataConnectQueryOptions<MyOrganizationsData>): UseDataConnectQueryResult<MyOrganizationsData, undefined>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useMyOrganizations(options?: useDataConnectQueryOptions<MyOrganizationsData>): UseDataConnectQueryResult<MyOrganizationsData, undefined>;
```

### Variables
The `MyOrganizations` Query has no variables.
### Return Type
Recall that calling the `MyOrganizations` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `MyOrganizations` Query is of type `MyOrganizationsData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `MyOrganizations`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';
import { useMyOrganizations } from '@dataconnect/generated/react'

export default function MyOrganizationsComponent() {
  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useMyOrganizations();

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useMyOrganizations(dataConnect);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useMyOrganizations(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useMyOrganizations(dataConnect, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.organizationMembers);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## CanManageWorkersForOrg
You can execute the `CanManageWorkersForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useCanManageWorkersForOrg(dc: DataConnect, vars: CanManageWorkersForOrgVariables, options?: useDataConnectQueryOptions<CanManageWorkersForOrgData>): UseDataConnectQueryResult<CanManageWorkersForOrgData, CanManageWorkersForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useCanManageWorkersForOrg(vars: CanManageWorkersForOrgVariables, options?: useDataConnectQueryOptions<CanManageWorkersForOrgData>): UseDataConnectQueryResult<CanManageWorkersForOrgData, CanManageWorkersForOrgVariables>;
```

### Variables
The `CanManageWorkersForOrg` Query requires an argument of type `CanManageWorkersForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface CanManageWorkersForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that calling the `CanManageWorkersForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `CanManageWorkersForOrg` Query is of type `CanManageWorkersForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface CanManageWorkersForOrgData {
  organizationMember?: {
    status?: string | null;
    role: string;
  };
}
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `CanManageWorkersForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, CanManageWorkersForOrgVariables } from '@dataconnect/generated';
import { useCanManageWorkersForOrg } from '@dataconnect/generated/react'

export default function CanManageWorkersForOrgComponent() {
  // The `useCanManageWorkersForOrg` Query hook requires an argument of type `CanManageWorkersForOrgVariables`:
  const canManageWorkersForOrgVars: CanManageWorkersForOrgVariables = {
    orgId: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useCanManageWorkersForOrg(canManageWorkersForOrgVars);
  // Variables can be defined inline as well.
  const query = useCanManageWorkersForOrg({ orgId: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useCanManageWorkersForOrg(dataConnect, canManageWorkersForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useCanManageWorkersForOrg(canManageWorkersForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useCanManageWorkersForOrg(dataConnect, canManageWorkersForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.organizationMember);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## WorkersForOrg
You can execute the `WorkersForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkersForOrg(dc: DataConnect, vars: WorkersForOrgVariables, options?: useDataConnectQueryOptions<WorkersForOrgData>): UseDataConnectQueryResult<WorkersForOrgData, WorkersForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkersForOrg(vars: WorkersForOrgVariables, options?: useDataConnectQueryOptions<WorkersForOrgData>): UseDataConnectQueryResult<WorkersForOrgData, WorkersForOrgVariables>;
```

### Variables
The `WorkersForOrg` Query requires an argument of type `WorkersForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkersForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that calling the `WorkersForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkersForOrg` Query is of type `WorkersForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkersForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkersForOrgVariables } from '@dataconnect/generated';
import { useWorkersForOrg } from '@dataconnect/generated/react'

export default function WorkersForOrgComponent() {
  // The `useWorkersForOrg` Query hook requires an argument of type `WorkersForOrgVariables`:
  const workersForOrgVars: WorkersForOrgVariables = {
    orgId: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkersForOrg(workersForOrgVars);
  // Variables can be defined inline as well.
  const query = useWorkersForOrg({ orgId: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkersForOrg(dataConnect, workersForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkersForOrg(workersForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkersForOrg(dataConnect, workersForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.organization);
    console.log(query.data.workers);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## ClientsForOrg
You can execute the `ClientsForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useClientsForOrg(dc: DataConnect, vars: ClientsForOrgVariables, options?: useDataConnectQueryOptions<ClientsForOrgData>): UseDataConnectQueryResult<ClientsForOrgData, ClientsForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useClientsForOrg(vars: ClientsForOrgVariables, options?: useDataConnectQueryOptions<ClientsForOrgData>): UseDataConnectQueryResult<ClientsForOrgData, ClientsForOrgVariables>;
```

### Variables
The `ClientsForOrg` Query requires an argument of type `ClientsForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface ClientsForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that calling the `ClientsForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `ClientsForOrg` Query is of type `ClientsForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `ClientsForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, ClientsForOrgVariables } from '@dataconnect/generated';
import { useClientsForOrg } from '@dataconnect/generated/react'

export default function ClientsForOrgComponent() {
  // The `useClientsForOrg` Query hook requires an argument of type `ClientsForOrgVariables`:
  const clientsForOrgVars: ClientsForOrgVariables = {
    orgId: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useClientsForOrg(clientsForOrgVars);
  // Variables can be defined inline as well.
  const query = useClientsForOrg({ orgId: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useClientsForOrg(dataConnect, clientsForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useClientsForOrg(clientsForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useClientsForOrg(dataConnect, clientsForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.clients);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## IndividualJobsForOrg
You can execute the `IndividualJobsForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useIndividualJobsForOrg(dc: DataConnect, vars: IndividualJobsForOrgVariables, options?: useDataConnectQueryOptions<IndividualJobsForOrgData>): UseDataConnectQueryResult<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useIndividualJobsForOrg(vars: IndividualJobsForOrgVariables, options?: useDataConnectQueryOptions<IndividualJobsForOrgData>): UseDataConnectQueryResult<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;
```

### Variables
The `IndividualJobsForOrg` Query requires an argument of type `IndividualJobsForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface IndividualJobsForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that calling the `IndividualJobsForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `IndividualJobsForOrg` Query is of type `IndividualJobsForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `IndividualJobsForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, IndividualJobsForOrgVariables } from '@dataconnect/generated';
import { useIndividualJobsForOrg } from '@dataconnect/generated/react'

export default function IndividualJobsForOrgComponent() {
  // The `useIndividualJobsForOrg` Query hook requires an argument of type `IndividualJobsForOrgVariables`:
  const individualJobsForOrgVars: IndividualJobsForOrgVariables = {
    orgId: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useIndividualJobsForOrg(individualJobsForOrgVars);
  // Variables can be defined inline as well.
  const query = useIndividualJobsForOrg({ orgId: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useIndividualJobsForOrg(dataConnect, individualJobsForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useIndividualJobsForOrg(individualJobsForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useIndividualJobsForOrg(dataConnect, individualJobsForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.individualClientJobs);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## TasksForOrg
You can execute the `TasksForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useTasksForOrg(dc: DataConnect, vars: TasksForOrgVariables, options?: useDataConnectQueryOptions<TasksForOrgData>): UseDataConnectQueryResult<TasksForOrgData, TasksForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useTasksForOrg(vars: TasksForOrgVariables, options?: useDataConnectQueryOptions<TasksForOrgData>): UseDataConnectQueryResult<TasksForOrgData, TasksForOrgVariables>;
```

### Variables
The `TasksForOrg` Query requires an argument of type `TasksForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface TasksForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that calling the `TasksForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `TasksForOrg` Query is of type `TasksForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `TasksForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, TasksForOrgVariables } from '@dataconnect/generated';
import { useTasksForOrg } from '@dataconnect/generated/react'

export default function TasksForOrgComponent() {
  // The `useTasksForOrg` Query hook requires an argument of type `TasksForOrgVariables`:
  const tasksForOrgVars: TasksForOrgVariables = {
    orgId: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useTasksForOrg(tasksForOrgVars);
  // Variables can be defined inline as well.
  const query = useTasksForOrg({ orgId: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useTasksForOrg(dataConnect, tasksForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useTasksForOrg(tasksForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useTasksForOrg(dataConnect, tasksForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.tasks);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## ZonesForOrg
You can execute the `ZonesForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useZonesForOrg(dc: DataConnect, vars: ZonesForOrgVariables, options?: useDataConnectQueryOptions<ZonesForOrgData>): UseDataConnectQueryResult<ZonesForOrgData, ZonesForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useZonesForOrg(vars: ZonesForOrgVariables, options?: useDataConnectQueryOptions<ZonesForOrgData>): UseDataConnectQueryResult<ZonesForOrgData, ZonesForOrgVariables>;
```

### Variables
The `ZonesForOrg` Query requires an argument of type `ZonesForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface ZonesForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that calling the `ZonesForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `ZonesForOrg` Query is of type `ZonesForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface ZonesForOrgData {
  zones: ({
    zoneId: string;
    clientId?: string | null;
    zone?: string | null;
    function?: string | null;
    editedBy?: string | null;
    date?: TimestampString | null;
    location?: string | null;
  })[];
}
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `ZonesForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, ZonesForOrgVariables } from '@dataconnect/generated';
import { useZonesForOrg } from '@dataconnect/generated/react'

export default function ZonesForOrgComponent() {
  // The `useZonesForOrg` Query hook requires an argument of type `ZonesForOrgVariables`:
  const zonesForOrgVars: ZonesForOrgVariables = {
    orgId: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useZonesForOrg(zonesForOrgVars);
  // Variables can be defined inline as well.
  const query = useZonesForOrg({ orgId: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useZonesForOrg(dataConnect, zonesForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useZonesForOrg(zonesForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useZonesForOrg(dataConnect, zonesForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.zones);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## WorkdaysForOrg
You can execute the `WorkdaysForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkdaysForOrg(dc: DataConnect, vars: WorkdaysForOrgVariables, options?: useDataConnectQueryOptions<WorkdaysForOrgData>): UseDataConnectQueryResult<WorkdaysForOrgData, WorkdaysForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkdaysForOrg(vars: WorkdaysForOrgVariables, options?: useDataConnectQueryOptions<WorkdaysForOrgData>): UseDataConnectQueryResult<WorkdaysForOrgData, WorkdaysForOrgVariables>;
```

### Variables
The `WorkdaysForOrg` Query requires an argument of type `WorkdaysForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkdaysForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that calling the `WorkdaysForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkdaysForOrg` Query is of type `WorkdaysForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkdaysForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkdaysForOrgVariables } from '@dataconnect/generated';
import { useWorkdaysForOrg } from '@dataconnect/generated/react'

export default function WorkdaysForOrgComponent() {
  // The `useWorkdaysForOrg` Query hook requires an argument of type `WorkdaysForOrgVariables`:
  const workdaysForOrgVars: WorkdaysForOrgVariables = {
    orgId: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkdaysForOrg(workdaysForOrgVars);
  // Variables can be defined inline as well.
  const query = useWorkdaysForOrg({ orgId: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkdaysForOrg(dataConnect, workdaysForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysForOrg(workdaysForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysForOrg(dataConnect, workdaysForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.workdays);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## WorkdaysPageForOrg
You can execute the `WorkdaysPageForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkdaysPageForOrg(dc: DataConnect, vars: WorkdaysPageForOrgVariables, options?: useDataConnectQueryOptions<WorkdaysPageForOrgData>): UseDataConnectQueryResult<WorkdaysPageForOrgData, WorkdaysPageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkdaysPageForOrg(vars: WorkdaysPageForOrgVariables, options?: useDataConnectQueryOptions<WorkdaysPageForOrgData>): UseDataConnectQueryResult<WorkdaysPageForOrgData, WorkdaysPageForOrgVariables>;
```

### Variables
The `WorkdaysPageForOrg` Query requires an argument of type `WorkdaysPageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkdaysPageForOrgVariables {
  orgId: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `WorkdaysPageForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkdaysPageForOrg` Query is of type `WorkdaysPageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkdaysPageForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkdaysPageForOrgVariables } from '@dataconnect/generated';
import { useWorkdaysPageForOrg } from '@dataconnect/generated/react'

export default function WorkdaysPageForOrgComponent() {
  // The `useWorkdaysPageForOrg` Query hook requires an argument of type `WorkdaysPageForOrgVariables`:
  const workdaysPageForOrgVars: WorkdaysPageForOrgVariables = {
    orgId: ..., 
    fromStartAt: ..., 
    toStartAt: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkdaysPageForOrg(workdaysPageForOrgVars);
  // Variables can be defined inline as well.
  const query = useWorkdaysPageForOrg({ orgId: ..., fromStartAt: ..., toStartAt: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkdaysPageForOrg(dataConnect, workdaysPageForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysPageForOrg(workdaysPageForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysPageForOrg(dataConnect, workdaysPageForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.workdays);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## WorkdaysPageForOrgByBusinessDate
You can execute the `WorkdaysPageForOrgByBusinessDate` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkdaysPageForOrgByBusinessDate(dc: DataConnect, vars: WorkdaysPageForOrgByBusinessDateVariables, options?: useDataConnectQueryOptions<WorkdaysPageForOrgByBusinessDateData>): UseDataConnectQueryResult<WorkdaysPageForOrgByBusinessDateData, WorkdaysPageForOrgByBusinessDateVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkdaysPageForOrgByBusinessDate(vars: WorkdaysPageForOrgByBusinessDateVariables, options?: useDataConnectQueryOptions<WorkdaysPageForOrgByBusinessDateData>): UseDataConnectQueryResult<WorkdaysPageForOrgByBusinessDateData, WorkdaysPageForOrgByBusinessDateVariables>;
```

### Variables
The `WorkdaysPageForOrgByBusinessDate` Query requires an argument of type `WorkdaysPageForOrgByBusinessDateVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkdaysPageForOrgByBusinessDateVariables {
  orgId: string;
  fromBusinessDateYmd: string;
  toBusinessDateYmd: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `WorkdaysPageForOrgByBusinessDate` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkdaysPageForOrgByBusinessDate` Query is of type `WorkdaysPageForOrgByBusinessDateData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkdaysPageForOrgByBusinessDate`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkdaysPageForOrgByBusinessDateVariables } from '@dataconnect/generated';
import { useWorkdaysPageForOrgByBusinessDate } from '@dataconnect/generated/react'

export default function WorkdaysPageForOrgByBusinessDateComponent() {
  // The `useWorkdaysPageForOrgByBusinessDate` Query hook requires an argument of type `WorkdaysPageForOrgByBusinessDateVariables`:
  const workdaysPageForOrgByBusinessDateVars: WorkdaysPageForOrgByBusinessDateVariables = {
    orgId: ..., 
    fromBusinessDateYmd: ..., 
    toBusinessDateYmd: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkdaysPageForOrgByBusinessDate(workdaysPageForOrgByBusinessDateVars);
  // Variables can be defined inline as well.
  const query = useWorkdaysPageForOrgByBusinessDate({ orgId: ..., fromBusinessDateYmd: ..., toBusinessDateYmd: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkdaysPageForOrgByBusinessDate(dataConnect, workdaysPageForOrgByBusinessDateVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysPageForOrgByBusinessDate(workdaysPageForOrgByBusinessDateVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysPageForOrgByBusinessDate(dataConnect, workdaysPageForOrgByBusinessDateVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.workdays);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## WorkdaysIntegrityPageForOrg
You can execute the `WorkdaysIntegrityPageForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkdaysIntegrityPageForOrg(dc: DataConnect, vars: WorkdaysIntegrityPageForOrgVariables, options?: useDataConnectQueryOptions<WorkdaysIntegrityPageForOrgData>): UseDataConnectQueryResult<WorkdaysIntegrityPageForOrgData, WorkdaysIntegrityPageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkdaysIntegrityPageForOrg(vars: WorkdaysIntegrityPageForOrgVariables, options?: useDataConnectQueryOptions<WorkdaysIntegrityPageForOrgData>): UseDataConnectQueryResult<WorkdaysIntegrityPageForOrgData, WorkdaysIntegrityPageForOrgVariables>;
```

### Variables
The `WorkdaysIntegrityPageForOrg` Query requires an argument of type `WorkdaysIntegrityPageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkdaysIntegrityPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `WorkdaysIntegrityPageForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkdaysIntegrityPageForOrg` Query is of type `WorkdaysIntegrityPageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkdaysIntegrityPageForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkdaysIntegrityPageForOrgVariables } from '@dataconnect/generated';
import { useWorkdaysIntegrityPageForOrg } from '@dataconnect/generated/react'

export default function WorkdaysIntegrityPageForOrgComponent() {
  // The `useWorkdaysIntegrityPageForOrg` Query hook requires an argument of type `WorkdaysIntegrityPageForOrgVariables`:
  const workdaysIntegrityPageForOrgVars: WorkdaysIntegrityPageForOrgVariables = {
    orgId: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkdaysIntegrityPageForOrg(workdaysIntegrityPageForOrgVars);
  // Variables can be defined inline as well.
  const query = useWorkdaysIntegrityPageForOrg({ orgId: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkdaysIntegrityPageForOrg(dataConnect, workdaysIntegrityPageForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysIntegrityPageForOrg(workdaysIntegrityPageForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysIntegrityPageForOrg(dataConnect, workdaysIntegrityPageForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.workdays);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## WorkdaysPageForOrgByWorker
You can execute the `WorkdaysPageForOrgByWorker` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkdaysPageForOrgByWorker(dc: DataConnect, vars: WorkdaysPageForOrgByWorkerVariables, options?: useDataConnectQueryOptions<WorkdaysPageForOrgByWorkerData>): UseDataConnectQueryResult<WorkdaysPageForOrgByWorkerData, WorkdaysPageForOrgByWorkerVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkdaysPageForOrgByWorker(vars: WorkdaysPageForOrgByWorkerVariables, options?: useDataConnectQueryOptions<WorkdaysPageForOrgByWorkerData>): UseDataConnectQueryResult<WorkdaysPageForOrgByWorkerData, WorkdaysPageForOrgByWorkerVariables>;
```

### Variables
The `WorkdaysPageForOrgByWorker` Query requires an argument of type `WorkdaysPageForOrgByWorkerVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkdaysPageForOrgByWorkerVariables {
  orgId: string;
  workerLogin: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `WorkdaysPageForOrgByWorker` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkdaysPageForOrgByWorker` Query is of type `WorkdaysPageForOrgByWorkerData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkdaysPageForOrgByWorker`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkdaysPageForOrgByWorkerVariables } from '@dataconnect/generated';
import { useWorkdaysPageForOrgByWorker } from '@dataconnect/generated/react'

export default function WorkdaysPageForOrgByWorkerComponent() {
  // The `useWorkdaysPageForOrgByWorker` Query hook requires an argument of type `WorkdaysPageForOrgByWorkerVariables`:
  const workdaysPageForOrgByWorkerVars: WorkdaysPageForOrgByWorkerVariables = {
    orgId: ..., 
    workerLogin: ..., 
    fromStartAt: ..., 
    toStartAt: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkdaysPageForOrgByWorker(workdaysPageForOrgByWorkerVars);
  // Variables can be defined inline as well.
  const query = useWorkdaysPageForOrgByWorker({ orgId: ..., workerLogin: ..., fromStartAt: ..., toStartAt: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkdaysPageForOrgByWorker(dataConnect, workdaysPageForOrgByWorkerVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysPageForOrgByWorker(workdaysPageForOrgByWorkerVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysPageForOrgByWorker(dataConnect, workdaysPageForOrgByWorkerVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.workdays);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## WorkdaysPageForOrgByWorkerAndStatus
You can execute the `WorkdaysPageForOrgByWorkerAndStatus` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkdaysPageForOrgByWorkerAndStatus(dc: DataConnect, vars: WorkdaysPageForOrgByWorkerAndStatusVariables, options?: useDataConnectQueryOptions<WorkdaysPageForOrgByWorkerAndStatusData>): UseDataConnectQueryResult<WorkdaysPageForOrgByWorkerAndStatusData, WorkdaysPageForOrgByWorkerAndStatusVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkdaysPageForOrgByWorkerAndStatus(vars: WorkdaysPageForOrgByWorkerAndStatusVariables, options?: useDataConnectQueryOptions<WorkdaysPageForOrgByWorkerAndStatusData>): UseDataConnectQueryResult<WorkdaysPageForOrgByWorkerAndStatusData, WorkdaysPageForOrgByWorkerAndStatusVariables>;
```

### Variables
The `WorkdaysPageForOrgByWorkerAndStatus` Query requires an argument of type `WorkdaysPageForOrgByWorkerAndStatusVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkdaysPageForOrgByWorkerAndStatusVariables {
  orgId: string;
  workerLogin: string;
  status: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `WorkdaysPageForOrgByWorkerAndStatus` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkdaysPageForOrgByWorkerAndStatus` Query is of type `WorkdaysPageForOrgByWorkerAndStatusData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkdaysPageForOrgByWorkerAndStatus`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkdaysPageForOrgByWorkerAndStatusVariables } from '@dataconnect/generated';
import { useWorkdaysPageForOrgByWorkerAndStatus } from '@dataconnect/generated/react'

export default function WorkdaysPageForOrgByWorkerAndStatusComponent() {
  // The `useWorkdaysPageForOrgByWorkerAndStatus` Query hook requires an argument of type `WorkdaysPageForOrgByWorkerAndStatusVariables`:
  const workdaysPageForOrgByWorkerAndStatusVars: WorkdaysPageForOrgByWorkerAndStatusVariables = {
    orgId: ..., 
    workerLogin: ..., 
    status: ..., 
    fromStartAt: ..., 
    toStartAt: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkdaysPageForOrgByWorkerAndStatus(workdaysPageForOrgByWorkerAndStatusVars);
  // Variables can be defined inline as well.
  const query = useWorkdaysPageForOrgByWorkerAndStatus({ orgId: ..., workerLogin: ..., status: ..., fromStartAt: ..., toStartAt: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkdaysPageForOrgByWorkerAndStatus(dataConnect, workdaysPageForOrgByWorkerAndStatusVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysPageForOrgByWorkerAndStatus(workdaysPageForOrgByWorkerAndStatusVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysPageForOrgByWorkerAndStatus(dataConnect, workdaysPageForOrgByWorkerAndStatusVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.workdays);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## WorkdaysPageForOrgByRoom
You can execute the `WorkdaysPageForOrgByRoom` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkdaysPageForOrgByRoom(dc: DataConnect, vars: WorkdaysPageForOrgByRoomVariables, options?: useDataConnectQueryOptions<WorkdaysPageForOrgByRoomData>): UseDataConnectQueryResult<WorkdaysPageForOrgByRoomData, WorkdaysPageForOrgByRoomVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkdaysPageForOrgByRoom(vars: WorkdaysPageForOrgByRoomVariables, options?: useDataConnectQueryOptions<WorkdaysPageForOrgByRoomData>): UseDataConnectQueryResult<WorkdaysPageForOrgByRoomData, WorkdaysPageForOrgByRoomVariables>;
```

### Variables
The `WorkdaysPageForOrgByRoom` Query requires an argument of type `WorkdaysPageForOrgByRoomVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkdaysPageForOrgByRoomVariables {
  orgId: string;
  utilityRoomId: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `WorkdaysPageForOrgByRoom` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkdaysPageForOrgByRoom` Query is of type `WorkdaysPageForOrgByRoomData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkdaysPageForOrgByRoom`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkdaysPageForOrgByRoomVariables } from '@dataconnect/generated';
import { useWorkdaysPageForOrgByRoom } from '@dataconnect/generated/react'

export default function WorkdaysPageForOrgByRoomComponent() {
  // The `useWorkdaysPageForOrgByRoom` Query hook requires an argument of type `WorkdaysPageForOrgByRoomVariables`:
  const workdaysPageForOrgByRoomVars: WorkdaysPageForOrgByRoomVariables = {
    orgId: ..., 
    utilityRoomId: ..., 
    fromStartAt: ..., 
    toStartAt: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkdaysPageForOrgByRoom(workdaysPageForOrgByRoomVars);
  // Variables can be defined inline as well.
  const query = useWorkdaysPageForOrgByRoom({ orgId: ..., utilityRoomId: ..., fromStartAt: ..., toStartAt: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkdaysPageForOrgByRoom(dataConnect, workdaysPageForOrgByRoomVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysPageForOrgByRoom(workdaysPageForOrgByRoomVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysPageForOrgByRoom(dataConnect, workdaysPageForOrgByRoomVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.workdays);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## WorkdaysPageForOrgByStatus
You can execute the `WorkdaysPageForOrgByStatus` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkdaysPageForOrgByStatus(dc: DataConnect, vars: WorkdaysPageForOrgByStatusVariables, options?: useDataConnectQueryOptions<WorkdaysPageForOrgByStatusData>): UseDataConnectQueryResult<WorkdaysPageForOrgByStatusData, WorkdaysPageForOrgByStatusVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkdaysPageForOrgByStatus(vars: WorkdaysPageForOrgByStatusVariables, options?: useDataConnectQueryOptions<WorkdaysPageForOrgByStatusData>): UseDataConnectQueryResult<WorkdaysPageForOrgByStatusData, WorkdaysPageForOrgByStatusVariables>;
```

### Variables
The `WorkdaysPageForOrgByStatus` Query requires an argument of type `WorkdaysPageForOrgByStatusVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkdaysPageForOrgByStatusVariables {
  orgId: string;
  status: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `WorkdaysPageForOrgByStatus` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkdaysPageForOrgByStatus` Query is of type `WorkdaysPageForOrgByStatusData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkdaysPageForOrgByStatus`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkdaysPageForOrgByStatusVariables } from '@dataconnect/generated';
import { useWorkdaysPageForOrgByStatus } from '@dataconnect/generated/react'

export default function WorkdaysPageForOrgByStatusComponent() {
  // The `useWorkdaysPageForOrgByStatus` Query hook requires an argument of type `WorkdaysPageForOrgByStatusVariables`:
  const workdaysPageForOrgByStatusVars: WorkdaysPageForOrgByStatusVariables = {
    orgId: ..., 
    status: ..., 
    fromStartAt: ..., 
    toStartAt: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkdaysPageForOrgByStatus(workdaysPageForOrgByStatusVars);
  // Variables can be defined inline as well.
  const query = useWorkdaysPageForOrgByStatus({ orgId: ..., status: ..., fromStartAt: ..., toStartAt: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkdaysPageForOrgByStatus(dataConnect, workdaysPageForOrgByStatusVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysPageForOrgByStatus(workdaysPageForOrgByStatusVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysPageForOrgByStatus(dataConnect, workdaysPageForOrgByStatusVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.workdays);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## WorkdaysFingerprintForOrg
You can execute the `WorkdaysFingerprintForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkdaysFingerprintForOrg(dc: DataConnect, vars: WorkdaysFingerprintForOrgVariables, options?: useDataConnectQueryOptions<WorkdaysFingerprintForOrgData>): UseDataConnectQueryResult<WorkdaysFingerprintForOrgData, WorkdaysFingerprintForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkdaysFingerprintForOrg(vars: WorkdaysFingerprintForOrgVariables, options?: useDataConnectQueryOptions<WorkdaysFingerprintForOrgData>): UseDataConnectQueryResult<WorkdaysFingerprintForOrgData, WorkdaysFingerprintForOrgVariables>;
```

### Variables
The `WorkdaysFingerprintForOrg` Query requires an argument of type `WorkdaysFingerprintForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkdaysFingerprintForOrgVariables {
  orgId: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
}
```
### Return Type
Recall that calling the `WorkdaysFingerprintForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkdaysFingerprintForOrg` Query is of type `WorkdaysFingerprintForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkdaysFingerprintForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkdaysFingerprintForOrgVariables } from '@dataconnect/generated';
import { useWorkdaysFingerprintForOrg } from '@dataconnect/generated/react'

export default function WorkdaysFingerprintForOrgComponent() {
  // The `useWorkdaysFingerprintForOrg` Query hook requires an argument of type `WorkdaysFingerprintForOrgVariables`:
  const workdaysFingerprintForOrgVars: WorkdaysFingerprintForOrgVariables = {
    orgId: ..., 
    fromStartAt: ..., 
    toStartAt: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkdaysFingerprintForOrg(workdaysFingerprintForOrgVars);
  // Variables can be defined inline as well.
  const query = useWorkdaysFingerprintForOrg({ orgId: ..., fromStartAt: ..., toStartAt: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkdaysFingerprintForOrg(dataConnect, workdaysFingerprintForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysFingerprintForOrg(workdaysFingerprintForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdaysFingerprintForOrg(dataConnect, workdaysFingerprintForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.workdays);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## BackupCyclesForOrg
You can execute the `BackupCyclesForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useBackupCyclesForOrg(dc: DataConnect, vars: BackupCyclesForOrgVariables, options?: useDataConnectQueryOptions<BackupCyclesForOrgData>): UseDataConnectQueryResult<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useBackupCyclesForOrg(vars: BackupCyclesForOrgVariables, options?: useDataConnectQueryOptions<BackupCyclesForOrgData>): UseDataConnectQueryResult<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;
```

### Variables
The `BackupCyclesForOrg` Query requires an argument of type `BackupCyclesForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface BackupCyclesForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that calling the `BackupCyclesForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `BackupCyclesForOrg` Query is of type `BackupCyclesForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `BackupCyclesForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, BackupCyclesForOrgVariables } from '@dataconnect/generated';
import { useBackupCyclesForOrg } from '@dataconnect/generated/react'

export default function BackupCyclesForOrgComponent() {
  // The `useBackupCyclesForOrg` Query hook requires an argument of type `BackupCyclesForOrgVariables`:
  const backupCyclesForOrgVars: BackupCyclesForOrgVariables = {
    orgId: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useBackupCyclesForOrg(backupCyclesForOrgVars);
  // Variables can be defined inline as well.
  const query = useBackupCyclesForOrg({ orgId: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useBackupCyclesForOrg(dataConnect, backupCyclesForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useBackupCyclesForOrg(backupCyclesForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useBackupCyclesForOrg(dataConnect, backupCyclesForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.backupCycles);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## EventsForOrg
You can execute the `EventsForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useEventsForOrg(dc: DataConnect, vars: EventsForOrgVariables, options?: useDataConnectQueryOptions<EventsForOrgData>): UseDataConnectQueryResult<EventsForOrgData, EventsForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useEventsForOrg(vars: EventsForOrgVariables, options?: useDataConnectQueryOptions<EventsForOrgData>): UseDataConnectQueryResult<EventsForOrgData, EventsForOrgVariables>;
```

### Variables
The `EventsForOrg` Query requires an argument of type `EventsForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface EventsForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that calling the `EventsForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `EventsForOrg` Query is of type `EventsForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `EventsForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, EventsForOrgVariables } from '@dataconnect/generated';
import { useEventsForOrg } from '@dataconnect/generated/react'

export default function EventsForOrgComponent() {
  // The `useEventsForOrg` Query hook requires an argument of type `EventsForOrgVariables`:
  const eventsForOrgVars: EventsForOrgVariables = {
    orgId: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useEventsForOrg(eventsForOrgVars);
  // Variables can be defined inline as well.
  const query = useEventsForOrg({ orgId: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useEventsForOrg(dataConnect, eventsForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useEventsForOrg(eventsForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useEventsForOrg(dataConnect, eventsForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.events);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## EventsIntegrityPageForOrg
You can execute the `EventsIntegrityPageForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useEventsIntegrityPageForOrg(dc: DataConnect, vars: EventsIntegrityPageForOrgVariables, options?: useDataConnectQueryOptions<EventsIntegrityPageForOrgData>): UseDataConnectQueryResult<EventsIntegrityPageForOrgData, EventsIntegrityPageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useEventsIntegrityPageForOrg(vars: EventsIntegrityPageForOrgVariables, options?: useDataConnectQueryOptions<EventsIntegrityPageForOrgData>): UseDataConnectQueryResult<EventsIntegrityPageForOrgData, EventsIntegrityPageForOrgVariables>;
```

### Variables
The `EventsIntegrityPageForOrg` Query requires an argument of type `EventsIntegrityPageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface EventsIntegrityPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `EventsIntegrityPageForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `EventsIntegrityPageForOrg` Query is of type `EventsIntegrityPageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `EventsIntegrityPageForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, EventsIntegrityPageForOrgVariables } from '@dataconnect/generated';
import { useEventsIntegrityPageForOrg } from '@dataconnect/generated/react'

export default function EventsIntegrityPageForOrgComponent() {
  // The `useEventsIntegrityPageForOrg` Query hook requires an argument of type `EventsIntegrityPageForOrgVariables`:
  const eventsIntegrityPageForOrgVars: EventsIntegrityPageForOrgVariables = {
    orgId: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useEventsIntegrityPageForOrg(eventsIntegrityPageForOrgVars);
  // Variables can be defined inline as well.
  const query = useEventsIntegrityPageForOrg({ orgId: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useEventsIntegrityPageForOrg(dataConnect, eventsIntegrityPageForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useEventsIntegrityPageForOrg(eventsIntegrityPageForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useEventsIntegrityPageForOrg(dataConnect, eventsIntegrityPageForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.events);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## EventsPageForOrg
You can execute the `EventsPageForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useEventsPageForOrg(dc: DataConnect, vars: EventsPageForOrgVariables, options?: useDataConnectQueryOptions<EventsPageForOrgData>): UseDataConnectQueryResult<EventsPageForOrgData, EventsPageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useEventsPageForOrg(vars: EventsPageForOrgVariables, options?: useDataConnectQueryOptions<EventsPageForOrgData>): UseDataConnectQueryResult<EventsPageForOrgData, EventsPageForOrgVariables>;
```

### Variables
The `EventsPageForOrg` Query requires an argument of type `EventsPageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface EventsPageForOrgVariables {
  orgId: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `EventsPageForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `EventsPageForOrg` Query is of type `EventsPageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `EventsPageForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, EventsPageForOrgVariables } from '@dataconnect/generated';
import { useEventsPageForOrg } from '@dataconnect/generated/react'

export default function EventsPageForOrgComponent() {
  // The `useEventsPageForOrg` Query hook requires an argument of type `EventsPageForOrgVariables`:
  const eventsPageForOrgVars: EventsPageForOrgVariables = {
    orgId: ..., 
    fromStartAt: ..., 
    toStartAt: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useEventsPageForOrg(eventsPageForOrgVars);
  // Variables can be defined inline as well.
  const query = useEventsPageForOrg({ orgId: ..., fromStartAt: ..., toStartAt: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useEventsPageForOrg(dataConnect, eventsPageForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useEventsPageForOrg(eventsPageForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useEventsPageForOrg(dataConnect, eventsPageForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.events);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## EventsPageForOrgByWorker
You can execute the `EventsPageForOrgByWorker` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useEventsPageForOrgByWorker(dc: DataConnect, vars: EventsPageForOrgByWorkerVariables, options?: useDataConnectQueryOptions<EventsPageForOrgByWorkerData>): UseDataConnectQueryResult<EventsPageForOrgByWorkerData, EventsPageForOrgByWorkerVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useEventsPageForOrgByWorker(vars: EventsPageForOrgByWorkerVariables, options?: useDataConnectQueryOptions<EventsPageForOrgByWorkerData>): UseDataConnectQueryResult<EventsPageForOrgByWorkerData, EventsPageForOrgByWorkerVariables>;
```

### Variables
The `EventsPageForOrgByWorker` Query requires an argument of type `EventsPageForOrgByWorkerVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface EventsPageForOrgByWorkerVariables {
  orgId: string;
  workerLogin: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `EventsPageForOrgByWorker` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `EventsPageForOrgByWorker` Query is of type `EventsPageForOrgByWorkerData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `EventsPageForOrgByWorker`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, EventsPageForOrgByWorkerVariables } from '@dataconnect/generated';
import { useEventsPageForOrgByWorker } from '@dataconnect/generated/react'

export default function EventsPageForOrgByWorkerComponent() {
  // The `useEventsPageForOrgByWorker` Query hook requires an argument of type `EventsPageForOrgByWorkerVariables`:
  const eventsPageForOrgByWorkerVars: EventsPageForOrgByWorkerVariables = {
    orgId: ..., 
    workerLogin: ..., 
    fromStartAt: ..., 
    toStartAt: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useEventsPageForOrgByWorker(eventsPageForOrgByWorkerVars);
  // Variables can be defined inline as well.
  const query = useEventsPageForOrgByWorker({ orgId: ..., workerLogin: ..., fromStartAt: ..., toStartAt: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useEventsPageForOrgByWorker(dataConnect, eventsPageForOrgByWorkerVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useEventsPageForOrgByWorker(eventsPageForOrgByWorkerVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useEventsPageForOrgByWorker(dataConnect, eventsPageForOrgByWorkerVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.events);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## EventsPageForOrgByZone
You can execute the `EventsPageForOrgByZone` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useEventsPageForOrgByZone(dc: DataConnect, vars: EventsPageForOrgByZoneVariables, options?: useDataConnectQueryOptions<EventsPageForOrgByZoneData>): UseDataConnectQueryResult<EventsPageForOrgByZoneData, EventsPageForOrgByZoneVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useEventsPageForOrgByZone(vars: EventsPageForOrgByZoneVariables, options?: useDataConnectQueryOptions<EventsPageForOrgByZoneData>): UseDataConnectQueryResult<EventsPageForOrgByZoneData, EventsPageForOrgByZoneVariables>;
```

### Variables
The `EventsPageForOrgByZone` Query requires an argument of type `EventsPageForOrgByZoneVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface EventsPageForOrgByZoneVariables {
  orgId: string;
  zoneId: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `EventsPageForOrgByZone` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `EventsPageForOrgByZone` Query is of type `EventsPageForOrgByZoneData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `EventsPageForOrgByZone`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, EventsPageForOrgByZoneVariables } from '@dataconnect/generated';
import { useEventsPageForOrgByZone } from '@dataconnect/generated/react'

export default function EventsPageForOrgByZoneComponent() {
  // The `useEventsPageForOrgByZone` Query hook requires an argument of type `EventsPageForOrgByZoneVariables`:
  const eventsPageForOrgByZoneVars: EventsPageForOrgByZoneVariables = {
    orgId: ..., 
    zoneId: ..., 
    fromStartAt: ..., 
    toStartAt: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useEventsPageForOrgByZone(eventsPageForOrgByZoneVars);
  // Variables can be defined inline as well.
  const query = useEventsPageForOrgByZone({ orgId: ..., zoneId: ..., fromStartAt: ..., toStartAt: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useEventsPageForOrgByZone(dataConnect, eventsPageForOrgByZoneVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useEventsPageForOrgByZone(eventsPageForOrgByZoneVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useEventsPageForOrgByZone(dataConnect, eventsPageForOrgByZoneVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.events);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## EventsPageForOrgByStatus
You can execute the `EventsPageForOrgByStatus` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useEventsPageForOrgByStatus(dc: DataConnect, vars: EventsPageForOrgByStatusVariables, options?: useDataConnectQueryOptions<EventsPageForOrgByStatusData>): UseDataConnectQueryResult<EventsPageForOrgByStatusData, EventsPageForOrgByStatusVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useEventsPageForOrgByStatus(vars: EventsPageForOrgByStatusVariables, options?: useDataConnectQueryOptions<EventsPageForOrgByStatusData>): UseDataConnectQueryResult<EventsPageForOrgByStatusData, EventsPageForOrgByStatusVariables>;
```

### Variables
The `EventsPageForOrgByStatus` Query requires an argument of type `EventsPageForOrgByStatusVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface EventsPageForOrgByStatusVariables {
  orgId: string;
  status: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `EventsPageForOrgByStatus` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `EventsPageForOrgByStatus` Query is of type `EventsPageForOrgByStatusData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `EventsPageForOrgByStatus`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, EventsPageForOrgByStatusVariables } from '@dataconnect/generated';
import { useEventsPageForOrgByStatus } from '@dataconnect/generated/react'

export default function EventsPageForOrgByStatusComponent() {
  // The `useEventsPageForOrgByStatus` Query hook requires an argument of type `EventsPageForOrgByStatusVariables`:
  const eventsPageForOrgByStatusVars: EventsPageForOrgByStatusVariables = {
    orgId: ..., 
    status: ..., 
    fromStartAt: ..., 
    toStartAt: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useEventsPageForOrgByStatus(eventsPageForOrgByStatusVars);
  // Variables can be defined inline as well.
  const query = useEventsPageForOrgByStatus({ orgId: ..., status: ..., fromStartAt: ..., toStartAt: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useEventsPageForOrgByStatus(dataConnect, eventsPageForOrgByStatusVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useEventsPageForOrgByStatus(eventsPageForOrgByStatusVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useEventsPageForOrgByStatus(dataConnect, eventsPageForOrgByStatusVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.events);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## EventsPageForOrgByTaskOccurrence
You can execute the `EventsPageForOrgByTaskOccurrence` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useEventsPageForOrgByTaskOccurrence(dc: DataConnect, vars: EventsPageForOrgByTaskOccurrenceVariables, options?: useDataConnectQueryOptions<EventsPageForOrgByTaskOccurrenceData>): UseDataConnectQueryResult<EventsPageForOrgByTaskOccurrenceData, EventsPageForOrgByTaskOccurrenceVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useEventsPageForOrgByTaskOccurrence(vars: EventsPageForOrgByTaskOccurrenceVariables, options?: useDataConnectQueryOptions<EventsPageForOrgByTaskOccurrenceData>): UseDataConnectQueryResult<EventsPageForOrgByTaskOccurrenceData, EventsPageForOrgByTaskOccurrenceVariables>;
```

### Variables
The `EventsPageForOrgByTaskOccurrence` Query requires an argument of type `EventsPageForOrgByTaskOccurrenceVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface EventsPageForOrgByTaskOccurrenceVariables {
  orgId: string;
  taskId: string;
  occurrenceDateYmd: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `EventsPageForOrgByTaskOccurrence` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `EventsPageForOrgByTaskOccurrence` Query is of type `EventsPageForOrgByTaskOccurrenceData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `EventsPageForOrgByTaskOccurrence`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, EventsPageForOrgByTaskOccurrenceVariables } from '@dataconnect/generated';
import { useEventsPageForOrgByTaskOccurrence } from '@dataconnect/generated/react'

export default function EventsPageForOrgByTaskOccurrenceComponent() {
  // The `useEventsPageForOrgByTaskOccurrence` Query hook requires an argument of type `EventsPageForOrgByTaskOccurrenceVariables`:
  const eventsPageForOrgByTaskOccurrenceVars: EventsPageForOrgByTaskOccurrenceVariables = {
    orgId: ..., 
    taskId: ..., 
    occurrenceDateYmd: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useEventsPageForOrgByTaskOccurrence(eventsPageForOrgByTaskOccurrenceVars);
  // Variables can be defined inline as well.
  const query = useEventsPageForOrgByTaskOccurrence({ orgId: ..., taskId: ..., occurrenceDateYmd: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useEventsPageForOrgByTaskOccurrence(dataConnect, eventsPageForOrgByTaskOccurrenceVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useEventsPageForOrgByTaskOccurrence(eventsPageForOrgByTaskOccurrenceVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useEventsPageForOrgByTaskOccurrence(dataConnect, eventsPageForOrgByTaskOccurrenceVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.events);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## EventsPageForOrgByPlanMatchStatus
You can execute the `EventsPageForOrgByPlanMatchStatus` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useEventsPageForOrgByPlanMatchStatus(dc: DataConnect, vars: EventsPageForOrgByPlanMatchStatusVariables, options?: useDataConnectQueryOptions<EventsPageForOrgByPlanMatchStatusData>): UseDataConnectQueryResult<EventsPageForOrgByPlanMatchStatusData, EventsPageForOrgByPlanMatchStatusVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useEventsPageForOrgByPlanMatchStatus(vars: EventsPageForOrgByPlanMatchStatusVariables, options?: useDataConnectQueryOptions<EventsPageForOrgByPlanMatchStatusData>): UseDataConnectQueryResult<EventsPageForOrgByPlanMatchStatusData, EventsPageForOrgByPlanMatchStatusVariables>;
```

### Variables
The `EventsPageForOrgByPlanMatchStatus` Query requires an argument of type `EventsPageForOrgByPlanMatchStatusVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface EventsPageForOrgByPlanMatchStatusVariables {
  orgId: string;
  matchStatus: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `EventsPageForOrgByPlanMatchStatus` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `EventsPageForOrgByPlanMatchStatus` Query is of type `EventsPageForOrgByPlanMatchStatusData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `EventsPageForOrgByPlanMatchStatus`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, EventsPageForOrgByPlanMatchStatusVariables } from '@dataconnect/generated';
import { useEventsPageForOrgByPlanMatchStatus } from '@dataconnect/generated/react'

export default function EventsPageForOrgByPlanMatchStatusComponent() {
  // The `useEventsPageForOrgByPlanMatchStatus` Query hook requires an argument of type `EventsPageForOrgByPlanMatchStatusVariables`:
  const eventsPageForOrgByPlanMatchStatusVars: EventsPageForOrgByPlanMatchStatusVariables = {
    orgId: ..., 
    matchStatus: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useEventsPageForOrgByPlanMatchStatus(eventsPageForOrgByPlanMatchStatusVars);
  // Variables can be defined inline as well.
  const query = useEventsPageForOrgByPlanMatchStatus({ orgId: ..., matchStatus: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useEventsPageForOrgByPlanMatchStatus(dataConnect, eventsPageForOrgByPlanMatchStatusVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useEventsPageForOrgByPlanMatchStatus(eventsPageForOrgByPlanMatchStatusVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useEventsPageForOrgByPlanMatchStatus(dataConnect, eventsPageForOrgByPlanMatchStatusVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.events);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## EventsFingerprintForOrg
You can execute the `EventsFingerprintForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useEventsFingerprintForOrg(dc: DataConnect, vars: EventsFingerprintForOrgVariables, options?: useDataConnectQueryOptions<EventsFingerprintForOrgData>): UseDataConnectQueryResult<EventsFingerprintForOrgData, EventsFingerprintForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useEventsFingerprintForOrg(vars: EventsFingerprintForOrgVariables, options?: useDataConnectQueryOptions<EventsFingerprintForOrgData>): UseDataConnectQueryResult<EventsFingerprintForOrgData, EventsFingerprintForOrgVariables>;
```

### Variables
The `EventsFingerprintForOrg` Query requires an argument of type `EventsFingerprintForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface EventsFingerprintForOrgVariables {
  orgId: string;
  fromStartAt: TimestampString;
  toStartAt: TimestampString;
}
```
### Return Type
Recall that calling the `EventsFingerprintForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `EventsFingerprintForOrg` Query is of type `EventsFingerprintForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `EventsFingerprintForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, EventsFingerprintForOrgVariables } from '@dataconnect/generated';
import { useEventsFingerprintForOrg } from '@dataconnect/generated/react'

export default function EventsFingerprintForOrgComponent() {
  // The `useEventsFingerprintForOrg` Query hook requires an argument of type `EventsFingerprintForOrgVariables`:
  const eventsFingerprintForOrgVars: EventsFingerprintForOrgVariables = {
    orgId: ..., 
    fromStartAt: ..., 
    toStartAt: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useEventsFingerprintForOrg(eventsFingerprintForOrgVars);
  // Variables can be defined inline as well.
  const query = useEventsFingerprintForOrg({ orgId: ..., fromStartAt: ..., toStartAt: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useEventsFingerprintForOrg(dataConnect, eventsFingerprintForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useEventsFingerprintForOrg(eventsFingerprintForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useEventsFingerprintForOrg(dataConnect, eventsFingerprintForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.events);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## WorkerWorkdaysForOrg
You can execute the `WorkerWorkdaysForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkerWorkdaysForOrg(dc: DataConnect, vars: WorkerWorkdaysForOrgVariables, options?: useDataConnectQueryOptions<WorkerWorkdaysForOrgData>): UseDataConnectQueryResult<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkerWorkdaysForOrg(vars: WorkerWorkdaysForOrgVariables, options?: useDataConnectQueryOptions<WorkerWorkdaysForOrgData>): UseDataConnectQueryResult<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;
```

### Variables
The `WorkerWorkdaysForOrg` Query requires an argument of type `WorkerWorkdaysForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkerWorkdaysForOrgVariables {
  orgId: string;
  workerLogin: string;
}
```
### Return Type
Recall that calling the `WorkerWorkdaysForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkerWorkdaysForOrg` Query is of type `WorkerWorkdaysForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkerWorkdaysForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkerWorkdaysForOrgVariables } from '@dataconnect/generated';
import { useWorkerWorkdaysForOrg } from '@dataconnect/generated/react'

export default function WorkerWorkdaysForOrgComponent() {
  // The `useWorkerWorkdaysForOrg` Query hook requires an argument of type `WorkerWorkdaysForOrgVariables`:
  const workerWorkdaysForOrgVars: WorkerWorkdaysForOrgVariables = {
    orgId: ..., 
    workerLogin: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkerWorkdaysForOrg(workerWorkdaysForOrgVars);
  // Variables can be defined inline as well.
  const query = useWorkerWorkdaysForOrg({ orgId: ..., workerLogin: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkerWorkdaysForOrg(dataConnect, workerWorkdaysForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkerWorkdaysForOrg(workerWorkdaysForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkerWorkdaysForOrg(dataConnect, workerWorkdaysForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.workdays);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## StorageForOrg
You can execute the `StorageForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useStorageForOrg(dc: DataConnect, vars: StorageForOrgVariables, options?: useDataConnectQueryOptions<StorageForOrgData>): UseDataConnectQueryResult<StorageForOrgData, StorageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useStorageForOrg(vars: StorageForOrgVariables, options?: useDataConnectQueryOptions<StorageForOrgData>): UseDataConnectQueryResult<StorageForOrgData, StorageForOrgVariables>;
```

### Variables
The `StorageForOrg` Query requires an argument of type `StorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface StorageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `StorageForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `StorageForOrg` Query is of type `StorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `StorageForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, StorageForOrgVariables } from '@dataconnect/generated';
import { useStorageForOrg } from '@dataconnect/generated/react'

export default function StorageForOrgComponent() {
  // The `useStorageForOrg` Query hook requires an argument of type `StorageForOrgVariables`:
  const storageForOrgVars: StorageForOrgVariables = {
    orgId: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useStorageForOrg(storageForOrgVars);
  // Variables can be defined inline as well.
  const query = useStorageForOrg({ orgId: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useStorageForOrg(dataConnect, storageForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useStorageForOrg(storageForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useStorageForOrg(dataConnect, storageForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.storages);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## ClientStorageForClient
You can execute the `ClientStorageForClient` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useClientStorageForClient(dc: DataConnect, vars: ClientStorageForClientVariables, options?: useDataConnectQueryOptions<ClientStorageForClientData>): UseDataConnectQueryResult<ClientStorageForClientData, ClientStorageForClientVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useClientStorageForClient(vars: ClientStorageForClientVariables, options?: useDataConnectQueryOptions<ClientStorageForClientData>): UseDataConnectQueryResult<ClientStorageForClientData, ClientStorageForClientVariables>;
```

### Variables
The `ClientStorageForClient` Query requires an argument of type `ClientStorageForClientVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface ClientStorageForClientVariables {
  orgId: string;
  clientId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `ClientStorageForClient` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `ClientStorageForClient` Query is of type `ClientStorageForClientData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `ClientStorageForClient`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, ClientStorageForClientVariables } from '@dataconnect/generated';
import { useClientStorageForClient } from '@dataconnect/generated/react'

export default function ClientStorageForClientComponent() {
  // The `useClientStorageForClient` Query hook requires an argument of type `ClientStorageForClientVariables`:
  const clientStorageForClientVars: ClientStorageForClientVariables = {
    orgId: ..., 
    clientId: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useClientStorageForClient(clientStorageForClientVars);
  // Variables can be defined inline as well.
  const query = useClientStorageForClient({ orgId: ..., clientId: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useClientStorageForClient(dataConnect, clientStorageForClientVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useClientStorageForClient(clientStorageForClientVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useClientStorageForClient(dataConnect, clientStorageForClientVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.clientStorages);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## ClientStorageForOrg
You can execute the `ClientStorageForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useClientStorageForOrg(dc: DataConnect, vars: ClientStorageForOrgVariables, options?: useDataConnectQueryOptions<ClientStorageForOrgData>): UseDataConnectQueryResult<ClientStorageForOrgData, ClientStorageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useClientStorageForOrg(vars: ClientStorageForOrgVariables, options?: useDataConnectQueryOptions<ClientStorageForOrgData>): UseDataConnectQueryResult<ClientStorageForOrgData, ClientStorageForOrgVariables>;
```

### Variables
The `ClientStorageForOrg` Query requires an argument of type `ClientStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface ClientStorageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `ClientStorageForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `ClientStorageForOrg` Query is of type `ClientStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `ClientStorageForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, ClientStorageForOrgVariables } from '@dataconnect/generated';
import { useClientStorageForOrg } from '@dataconnect/generated/react'

export default function ClientStorageForOrgComponent() {
  // The `useClientStorageForOrg` Query hook requires an argument of type `ClientStorageForOrgVariables`:
  const clientStorageForOrgVars: ClientStorageForOrgVariables = {
    orgId: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useClientStorageForOrg(clientStorageForOrgVars);
  // Variables can be defined inline as well.
  const query = useClientStorageForOrg({ orgId: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useClientStorageForOrg(dataConnect, clientStorageForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useClientStorageForOrg(clientStorageForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useClientStorageForOrg(dataConnect, clientStorageForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.clientStorages);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## WorkdayPausesForOrg
You can execute the `WorkdayPausesForOrg` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkdayPausesForOrg(dc: DataConnect, vars: WorkdayPausesForOrgVariables, options?: useDataConnectQueryOptions<WorkdayPausesForOrgData>): UseDataConnectQueryResult<WorkdayPausesForOrgData, WorkdayPausesForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkdayPausesForOrg(vars: WorkdayPausesForOrgVariables, options?: useDataConnectQueryOptions<WorkdayPausesForOrgData>): UseDataConnectQueryResult<WorkdayPausesForOrgData, WorkdayPausesForOrgVariables>;
```

### Variables
The `WorkdayPausesForOrg` Query requires an argument of type `WorkdayPausesForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkdayPausesForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that calling the `WorkdayPausesForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkdayPausesForOrg` Query is of type `WorkdayPausesForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkdayPausesForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkdayPausesForOrgVariables } from '@dataconnect/generated';
import { useWorkdayPausesForOrg } from '@dataconnect/generated/react'

export default function WorkdayPausesForOrgComponent() {
  // The `useWorkdayPausesForOrg` Query hook requires an argument of type `WorkdayPausesForOrgVariables`:
  const workdayPausesForOrgVars: WorkdayPausesForOrgVariables = {
    orgId: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkdayPausesForOrg(workdayPausesForOrgVars);
  // Variables can be defined inline as well.
  const query = useWorkdayPausesForOrg({ orgId: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkdayPausesForOrg(dataConnect, workdayPausesForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdayPausesForOrg(workdayPausesForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdayPausesForOrg(dataConnect, workdayPausesForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.workdayPauses);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## ActiveWorkdayPauseForWorker
You can execute the `ActiveWorkdayPauseForWorker` Query using the following Query hook function, which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts):

```javascript
useActiveWorkdayPauseForWorker(dc: DataConnect, vars: ActiveWorkdayPauseForWorkerVariables, options?: useDataConnectQueryOptions<ActiveWorkdayPauseForWorkerData>): UseDataConnectQueryResult<ActiveWorkdayPauseForWorkerData, ActiveWorkdayPauseForWorkerVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useActiveWorkdayPauseForWorker(vars: ActiveWorkdayPauseForWorkerVariables, options?: useDataConnectQueryOptions<ActiveWorkdayPauseForWorkerData>): UseDataConnectQueryResult<ActiveWorkdayPauseForWorkerData, ActiveWorkdayPauseForWorkerVariables>;
```

### Variables
The `ActiveWorkdayPauseForWorker` Query requires an argument of type `ActiveWorkdayPauseForWorkerVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface ActiveWorkdayPauseForWorkerVariables {
  orgId: string;
  workerLogin: string;
}
```
### Return Type
Recall that calling the `ActiveWorkdayPauseForWorker` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `ActiveWorkdayPauseForWorker` Query is of type `ActiveWorkdayPauseForWorkerData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `ActiveWorkdayPauseForWorker`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, ActiveWorkdayPauseForWorkerVariables } from '@dataconnect/generated';
import { useActiveWorkdayPauseForWorker } from '@dataconnect/generated/react'

export default function ActiveWorkdayPauseForWorkerComponent() {
  // The `useActiveWorkdayPauseForWorker` Query hook requires an argument of type `ActiveWorkdayPauseForWorkerVariables`:
  const activeWorkdayPauseForWorkerVars: ActiveWorkdayPauseForWorkerVariables = {
    orgId: ..., 
    workerLogin: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useActiveWorkdayPauseForWorker(activeWorkdayPauseForWorkerVars);
  // Variables can be defined inline as well.
  const query = useActiveWorkdayPauseForWorker({ orgId: ..., workerLogin: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useActiveWorkdayPauseForWorker(dataConnect, activeWorkdayPauseForWorkerVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useActiveWorkdayPauseForWorker(activeWorkdayPauseForWorkerVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useActiveWorkdayPauseForWorker(dataConnect, activeWorkdayPauseForWorkerVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.workdayPauses);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

# Mutations

The React generated SDK provides Mutations hook functions that call and return [`useDataConnectMutation`](https://react-query-firebase.invertase.dev/react/data-connect/mutations) hooks from TanStack Query Firebase.

Calling these hook functions will return a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, and the most recent data returned by the Mutation, among other things. To learn more about these hooks and how to use them, see the [TanStack Query Firebase documentation](https://react-query-firebase.invertase.dev/react/data-connect/mutations).

Mutation hooks do not execute their Mutations automatically when called. Rather, after calling the Mutation hook function and getting a `UseMutationResult` object, you must call the `UseMutationResult.mutate()` function to execute the Mutation.

To learn more about TanStack React Query's Mutations, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/guides/mutations).

## Using Mutation Hooks
Here's a general overview of how to use the generated Mutation hooks in your code:

- Mutation hook functions are not called with the arguments to the Mutation. Instead, arguments are passed to `UseMutationResult.mutate()`.
- If the Mutation has no variables, the `mutate()` function does not require arguments.
- If the Mutation has any required variables, the `mutate()` function will require at least one argument: an object that contains all the required variables for the Mutation.
- If the Mutation has some required and some optional variables, only required variables are necessary in the variables argument object, and optional variables may be provided as well.
- If all of the Mutation's variables are optional, the Mutation hook function does not require any arguments.
- Mutation hook functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.
- Mutation hooks also accept an `options` argument of type `useDataConnectMutationOptions`. To learn more about the `options` argument, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/guides/mutations#mutation-side-effects).
  - `UseMutationResult.mutate()` also accepts an `options` argument of type `useDataConnectMutationOptions`.
  - ***Special case:*** If the Mutation has no arguments (or all optional arguments and you wish to provide none), and you want to pass `options` to `UseMutationResult.mutate()`, you must pass `undefined` where you would normally pass the Mutation's arguments, and then may provide the options argument.

Below are examples of how to use the `example` connector's generated Mutation hook functions to execute each Mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#operations-react-angular).

## InsertClientForOrg
You can execute the `InsertClientForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useInsertClientForOrg(options?: useDataConnectMutationOptions<InsertClientForOrgData, FirebaseError, InsertClientForOrgVariables>): UseDataConnectMutationResult<InsertClientForOrgData, InsertClientForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useInsertClientForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertClientForOrgData, FirebaseError, InsertClientForOrgVariables>): UseDataConnectMutationResult<InsertClientForOrgData, InsertClientForOrgVariables>;
```

### Variables
The `InsertClientForOrg` Mutation requires an argument of type `InsertClientForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `InsertClientForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `InsertClientForOrg` Mutation is of type `InsertClientForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface InsertClientForOrgData {
  client_insert: Client_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `InsertClientForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, InsertClientForOrgVariables } from '@dataconnect/generated';
import { useInsertClientForOrg } from '@dataconnect/generated/react'

export default function InsertClientForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useInsertClientForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useInsertClientForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertClientForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertClientForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useInsertClientForOrg` Mutation requires an argument of type `InsertClientForOrgVariables`:
  const insertClientForOrgVars: InsertClientForOrgVariables = {
    orgId: ..., 
    clientId: ..., 
    name: ..., // optional
    nip: ..., // optional
    city: ..., // optional
    address: ..., // optional
    contact: ..., // optional
    status: ..., // optional
    clientType: ..., // optional
    coordinator: ..., // optional
    serviceFrequency: ..., // optional
    assignees: ..., // optional
    chemistry: ..., // optional
    equipment: ..., // optional
    clientInfo: ..., // optional
    objectType: ..., // optional
    cooperationStartAt: ..., // optional
    cooperationEndAt: ..., // optional
    contactPerson: ..., // optional
    phone: ..., // optional
    email: ..., // optional
    emergencyContact: ..., // optional
    contactPosition: ..., // optional
    postalCode: ..., // optional
    accessHours: ..., // optional
    accessMethod: ..., // optional
    serviceEntry: ..., // optional
    serviceType: ..., // optional
    serviceDays: ..., // optional
    preferredHours: ..., // optional
    workMode: ..., // optional
    sla: ..., // optional
    rbhAmount: ..., // optional
    requiredPermissions: ..., // optional
    bhpRequirements: ..., // optional
    workRestrictions: ..., // optional
    excludedZones: ..., // optional
    operationalRisks: ..., // optional
    specialInstructions: ..., // optional
    specialEquipment: ..., // optional
    storagePlace: ..., // optional
    backroomAccess: ..., // optional
    technicalNotes: ..., // optional
    internalNotes: ..., // optional
    coordinatorChangedAt: ..., // optional
    lastExecutionAt: ..., // optional
    lastWorkerAssignmentAt: ..., // optional
  };
  mutation.mutate(insertClientForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., clientId: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., status: ..., clientType: ..., coordinator: ..., serviceFrequency: ..., assignees: ..., chemistry: ..., equipment: ..., clientInfo: ..., objectType: ..., cooperationStartAt: ..., cooperationEndAt: ..., contactPerson: ..., phone: ..., email: ..., emergencyContact: ..., contactPosition: ..., postalCode: ..., accessHours: ..., accessMethod: ..., serviceEntry: ..., serviceType: ..., serviceDays: ..., preferredHours: ..., workMode: ..., sla: ..., rbhAmount: ..., requiredPermissions: ..., bhpRequirements: ..., workRestrictions: ..., excludedZones: ..., operationalRisks: ..., specialInstructions: ..., specialEquipment: ..., storagePlace: ..., backroomAccess: ..., technicalNotes: ..., internalNotes: ..., coordinatorChangedAt: ..., lastExecutionAt: ..., lastWorkerAssignmentAt: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(insertClientForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.client_insert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## UpdateClientForOrg
You can execute the `UpdateClientForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useUpdateClientForOrg(options?: useDataConnectMutationOptions<UpdateClientForOrgData, FirebaseError, UpdateClientForOrgVariables>): UseDataConnectMutationResult<UpdateClientForOrgData, UpdateClientForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useUpdateClientForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateClientForOrgData, FirebaseError, UpdateClientForOrgVariables>): UseDataConnectMutationResult<UpdateClientForOrgData, UpdateClientForOrgVariables>;
```

### Variables
The `UpdateClientForOrg` Mutation requires an argument of type `UpdateClientForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `UpdateClientForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `UpdateClientForOrg` Mutation is of type `UpdateClientForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface UpdateClientForOrgData {
  client_update?: Client_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `UpdateClientForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, UpdateClientForOrgVariables } from '@dataconnect/generated';
import { useUpdateClientForOrg } from '@dataconnect/generated/react'

export default function UpdateClientForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useUpdateClientForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useUpdateClientForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateClientForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateClientForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useUpdateClientForOrg` Mutation requires an argument of type `UpdateClientForOrgVariables`:
  const updateClientForOrgVars: UpdateClientForOrgVariables = {
    orgId: ..., 
    clientId: ..., 
    name: ..., // optional
    nip: ..., // optional
    city: ..., // optional
    address: ..., // optional
    contact: ..., // optional
    status: ..., // optional
    clientType: ..., // optional
    coordinator: ..., // optional
    serviceFrequency: ..., // optional
    assignees: ..., // optional
    chemistry: ..., // optional
    equipment: ..., // optional
    clientInfo: ..., // optional
    objectType: ..., // optional
    cooperationStartAt: ..., // optional
    cooperationEndAt: ..., // optional
    contactPerson: ..., // optional
    phone: ..., // optional
    email: ..., // optional
    emergencyContact: ..., // optional
    contactPosition: ..., // optional
    postalCode: ..., // optional
    accessHours: ..., // optional
    accessMethod: ..., // optional
    serviceEntry: ..., // optional
    serviceType: ..., // optional
    serviceDays: ..., // optional
    preferredHours: ..., // optional
    workMode: ..., // optional
    sla: ..., // optional
    rbhAmount: ..., // optional
    requiredPermissions: ..., // optional
    bhpRequirements: ..., // optional
    workRestrictions: ..., // optional
    excludedZones: ..., // optional
    operationalRisks: ..., // optional
    specialInstructions: ..., // optional
    specialEquipment: ..., // optional
    storagePlace: ..., // optional
    backroomAccess: ..., // optional
    technicalNotes: ..., // optional
    internalNotes: ..., // optional
    coordinatorChangedAt: ..., // optional
    lastExecutionAt: ..., // optional
    lastWorkerAssignmentAt: ..., // optional
  };
  mutation.mutate(updateClientForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., clientId: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., status: ..., clientType: ..., coordinator: ..., serviceFrequency: ..., assignees: ..., chemistry: ..., equipment: ..., clientInfo: ..., objectType: ..., cooperationStartAt: ..., cooperationEndAt: ..., contactPerson: ..., phone: ..., email: ..., emergencyContact: ..., contactPosition: ..., postalCode: ..., accessHours: ..., accessMethod: ..., serviceEntry: ..., serviceType: ..., serviceDays: ..., preferredHours: ..., workMode: ..., sla: ..., rbhAmount: ..., requiredPermissions: ..., bhpRequirements: ..., workRestrictions: ..., excludedZones: ..., operationalRisks: ..., specialInstructions: ..., specialEquipment: ..., storagePlace: ..., backroomAccess: ..., technicalNotes: ..., internalNotes: ..., coordinatorChangedAt: ..., lastExecutionAt: ..., lastWorkerAssignmentAt: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(updateClientForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.client_update);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## DeleteClientForOrg
You can execute the `DeleteClientForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useDeleteClientForOrg(options?: useDataConnectMutationOptions<DeleteClientForOrgData, FirebaseError, DeleteClientForOrgVariables>): UseDataConnectMutationResult<DeleteClientForOrgData, DeleteClientForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useDeleteClientForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteClientForOrgData, FirebaseError, DeleteClientForOrgVariables>): UseDataConnectMutationResult<DeleteClientForOrgData, DeleteClientForOrgVariables>;
```

### Variables
The `DeleteClientForOrg` Mutation requires an argument of type `DeleteClientForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface DeleteClientForOrgVariables {
  orgId: string;
  clientId: string;
}
```
### Return Type
Recall that calling the `DeleteClientForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `DeleteClientForOrg` Mutation is of type `DeleteClientForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `DeleteClientForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, DeleteClientForOrgVariables } from '@dataconnect/generated';
import { useDeleteClientForOrg } from '@dataconnect/generated/react'

export default function DeleteClientForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useDeleteClientForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useDeleteClientForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteClientForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteClientForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useDeleteClientForOrg` Mutation requires an argument of type `DeleteClientForOrgVariables`:
  const deleteClientForOrgVars: DeleteClientForOrgVariables = {
    orgId: ..., 
    clientId: ..., 
  };
  mutation.mutate(deleteClientForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., clientId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(deleteClientForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.checkListLog_deleteMany);
    console.log(mutation.data.checkListExtra_deleteMany);
    console.log(mutation.data.checkListDef_deleteMany);
    console.log(mutation.data.clientStorage_deleteMany);
    console.log(mutation.data.event_deleteMany);
    console.log(mutation.data.task_deleteMany);
    console.log(mutation.data.zone_deleteMany);
    console.log(mutation.data.client_delete);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## InsertIndividualJobForOrg
You can execute the `InsertIndividualJobForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useInsertIndividualJobForOrg(options?: useDataConnectMutationOptions<InsertIndividualJobForOrgData, FirebaseError, InsertIndividualJobForOrgVariables>): UseDataConnectMutationResult<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useInsertIndividualJobForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertIndividualJobForOrgData, FirebaseError, InsertIndividualJobForOrgVariables>): UseDataConnectMutationResult<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;
```

### Variables
The `InsertIndividualJobForOrg` Mutation requires an argument of type `InsertIndividualJobForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `InsertIndividualJobForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `InsertIndividualJobForOrg` Mutation is of type `InsertIndividualJobForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface InsertIndividualJobForOrgData {
  individualClientJob_insert: IndividualClientJob_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `InsertIndividualJobForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, InsertIndividualJobForOrgVariables } from '@dataconnect/generated';
import { useInsertIndividualJobForOrg } from '@dataconnect/generated/react'

export default function InsertIndividualJobForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useInsertIndividualJobForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useInsertIndividualJobForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertIndividualJobForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertIndividualJobForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useInsertIndividualJobForOrg` Mutation requires an argument of type `InsertIndividualJobForOrgVariables`:
  const insertIndividualJobForOrgVars: InsertIndividualJobForOrgVariables = {
    orgId: ..., 
    clientIndId: ..., 
    date: ..., // optional
    name: ..., // optional
    nip: ..., // optional
    city: ..., // optional
    address: ..., // optional
    contact: ..., // optional
    clientInfo: ..., // optional
    qrCode: ..., // optional
  };
  mutation.mutate(insertIndividualJobForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., clientIndId: ..., date: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., clientInfo: ..., qrCode: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(insertIndividualJobForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.individualClientJob_insert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## UpdateIndividualJobForOrg
You can execute the `UpdateIndividualJobForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useUpdateIndividualJobForOrg(options?: useDataConnectMutationOptions<UpdateIndividualJobForOrgData, FirebaseError, UpdateIndividualJobForOrgVariables>): UseDataConnectMutationResult<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useUpdateIndividualJobForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateIndividualJobForOrgData, FirebaseError, UpdateIndividualJobForOrgVariables>): UseDataConnectMutationResult<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;
```

### Variables
The `UpdateIndividualJobForOrg` Mutation requires an argument of type `UpdateIndividualJobForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `UpdateIndividualJobForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `UpdateIndividualJobForOrg` Mutation is of type `UpdateIndividualJobForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface UpdateIndividualJobForOrgData {
  individualClientJob_update?: IndividualClientJob_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `UpdateIndividualJobForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, UpdateIndividualJobForOrgVariables } from '@dataconnect/generated';
import { useUpdateIndividualJobForOrg } from '@dataconnect/generated/react'

export default function UpdateIndividualJobForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useUpdateIndividualJobForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useUpdateIndividualJobForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateIndividualJobForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateIndividualJobForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useUpdateIndividualJobForOrg` Mutation requires an argument of type `UpdateIndividualJobForOrgVariables`:
  const updateIndividualJobForOrgVars: UpdateIndividualJobForOrgVariables = {
    orgId: ..., 
    clientIndId: ..., 
    date: ..., // optional
    name: ..., // optional
    nip: ..., // optional
    city: ..., // optional
    address: ..., // optional
    contact: ..., // optional
    clientInfo: ..., // optional
    qrCode: ..., // optional
  };
  mutation.mutate(updateIndividualJobForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., clientIndId: ..., date: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., clientInfo: ..., qrCode: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(updateIndividualJobForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.individualClientJob_update);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## DeleteIndividualJobForOrg
You can execute the `DeleteIndividualJobForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useDeleteIndividualJobForOrg(options?: useDataConnectMutationOptions<DeleteIndividualJobForOrgData, FirebaseError, DeleteIndividualJobForOrgVariables>): UseDataConnectMutationResult<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useDeleteIndividualJobForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteIndividualJobForOrgData, FirebaseError, DeleteIndividualJobForOrgVariables>): UseDataConnectMutationResult<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;
```

### Variables
The `DeleteIndividualJobForOrg` Mutation requires an argument of type `DeleteIndividualJobForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface DeleteIndividualJobForOrgVariables {
  orgId: string;
  clientIndId: string;
}
```
### Return Type
Recall that calling the `DeleteIndividualJobForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `DeleteIndividualJobForOrg` Mutation is of type `DeleteIndividualJobForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface DeleteIndividualJobForOrgData {
  individualClientJob_delete?: IndividualClientJob_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `DeleteIndividualJobForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, DeleteIndividualJobForOrgVariables } from '@dataconnect/generated';
import { useDeleteIndividualJobForOrg } from '@dataconnect/generated/react'

export default function DeleteIndividualJobForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useDeleteIndividualJobForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useDeleteIndividualJobForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteIndividualJobForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteIndividualJobForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useDeleteIndividualJobForOrg` Mutation requires an argument of type `DeleteIndividualJobForOrgVariables`:
  const deleteIndividualJobForOrgVars: DeleteIndividualJobForOrgVariables = {
    orgId: ..., 
    clientIndId: ..., 
  };
  mutation.mutate(deleteIndividualJobForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., clientIndId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(deleteIndividualJobForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.individualClientJob_delete);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## UpsertTaskForOrg
You can execute the `UpsertTaskForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useUpsertTaskForOrg(options?: useDataConnectMutationOptions<UpsertTaskForOrgData, FirebaseError, UpsertTaskForOrgVariables>): UseDataConnectMutationResult<UpsertTaskForOrgData, UpsertTaskForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useUpsertTaskForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpsertTaskForOrgData, FirebaseError, UpsertTaskForOrgVariables>): UseDataConnectMutationResult<UpsertTaskForOrgData, UpsertTaskForOrgVariables>;
```

### Variables
The `UpsertTaskForOrg` Mutation requires an argument of type `UpsertTaskForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `UpsertTaskForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `UpsertTaskForOrg` Mutation is of type `UpsertTaskForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface UpsertTaskForOrgData {
  task_upsert: Task_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `UpsertTaskForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, UpsertTaskForOrgVariables } from '@dataconnect/generated';
import { useUpsertTaskForOrg } from '@dataconnect/generated/react'

export default function UpsertTaskForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useUpsertTaskForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useUpsertTaskForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpsertTaskForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpsertTaskForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useUpsertTaskForOrg` Mutation requires an argument of type `UpsertTaskForOrgVariables`:
  const upsertTaskForOrgVars: UpsertTaskForOrgVariables = {
    orgId: ..., 
    idTask: ..., 
    lifecycleStatus: ..., // optional
    cancelledAt: ..., // optional
    archivedAt: ..., // optional
    dateYmd: ..., // optional
    startTime: ..., // optional
    endDateYmd: ..., // optional
    endTime: ..., // optional
    scheduleMode: ..., // optional
    accessStartTime: ..., // optional
    accessEndTime: ..., // optional
    accessWindows: ..., // optional
    requiredWorkMinutes: ..., // optional
    requiredPeople: ..., // optional
    workAllocations: ..., // optional
    workerId: ..., // optional
    workerIds: ..., // optional
    workerLabel: ..., // optional
    workerName: ..., // optional
    workerLogin: ..., // optional
    clientId: ..., // optional
    clientLabel: ..., // optional
    clientName: ..., // optional
    nip: ..., // optional
    street: ..., // optional
    city: ..., // optional
    postCode: ..., // optional
    addressLabel: ..., // optional
    executionAddressLabel: ..., // optional
    lat: ..., // optional
    lng: ..., // optional
    zoneId: ..., // optional
    zoneLabel: ..., // optional
    repeatPreset: ..., // optional
    repeatEvery: ..., // optional
    repeatUnit: ..., // optional
    repeatWeekdays: ..., // optional
    weeklyScheduleRules: ..., // optional
    title: ..., // optional
    type: ..., // optional
    price: ..., // optional
    description: ..., // optional
    workerComment: ..., // optional
    supplies: ..., // optional
    objectPlanTasks: ..., // optional
    allowExtendedWork: ..., // optional
    createdByUid: ..., // optional
    updatedByUid: ..., // optional
    createdAt: ..., // optional
    updatedAt: ..., // optional
  };
  mutation.mutate(upsertTaskForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., idTask: ..., lifecycleStatus: ..., cancelledAt: ..., archivedAt: ..., dateYmd: ..., startTime: ..., endDateYmd: ..., endTime: ..., scheduleMode: ..., accessStartTime: ..., accessEndTime: ..., accessWindows: ..., requiredWorkMinutes: ..., requiredPeople: ..., workAllocations: ..., workerId: ..., workerIds: ..., workerLabel: ..., workerName: ..., workerLogin: ..., clientId: ..., clientLabel: ..., clientName: ..., nip: ..., street: ..., city: ..., postCode: ..., addressLabel: ..., executionAddressLabel: ..., lat: ..., lng: ..., zoneId: ..., zoneLabel: ..., repeatPreset: ..., repeatEvery: ..., repeatUnit: ..., repeatWeekdays: ..., weeklyScheduleRules: ..., title: ..., type: ..., price: ..., description: ..., workerComment: ..., supplies: ..., objectPlanTasks: ..., allowExtendedWork: ..., createdByUid: ..., updatedByUid: ..., createdAt: ..., updatedAt: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(upsertTaskForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.task_upsert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## DeleteTaskForOrg
You can execute the `DeleteTaskForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useDeleteTaskForOrg(options?: useDataConnectMutationOptions<DeleteTaskForOrgData, FirebaseError, DeleteTaskForOrgVariables>): UseDataConnectMutationResult<DeleteTaskForOrgData, DeleteTaskForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useDeleteTaskForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteTaskForOrgData, FirebaseError, DeleteTaskForOrgVariables>): UseDataConnectMutationResult<DeleteTaskForOrgData, DeleteTaskForOrgVariables>;
```

### Variables
The `DeleteTaskForOrg` Mutation requires an argument of type `DeleteTaskForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface DeleteTaskForOrgVariables {
  orgId: string;
  idTask: string;
}
```
### Return Type
Recall that calling the `DeleteTaskForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `DeleteTaskForOrg` Mutation is of type `DeleteTaskForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface DeleteTaskForOrgData {
  task_delete?: Task_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `DeleteTaskForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, DeleteTaskForOrgVariables } from '@dataconnect/generated';
import { useDeleteTaskForOrg } from '@dataconnect/generated/react'

export default function DeleteTaskForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useDeleteTaskForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useDeleteTaskForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteTaskForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteTaskForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useDeleteTaskForOrg` Mutation requires an argument of type `DeleteTaskForOrgVariables`:
  const deleteTaskForOrgVars: DeleteTaskForOrgVariables = {
    orgId: ..., 
    idTask: ..., 
  };
  mutation.mutate(deleteTaskForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., idTask: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(deleteTaskForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.task_delete);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## InsertZoneForOrg
You can execute the `InsertZoneForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useInsertZoneForOrg(options?: useDataConnectMutationOptions<InsertZoneForOrgData, FirebaseError, InsertZoneForOrgVariables>): UseDataConnectMutationResult<InsertZoneForOrgData, InsertZoneForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useInsertZoneForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertZoneForOrgData, FirebaseError, InsertZoneForOrgVariables>): UseDataConnectMutationResult<InsertZoneForOrgData, InsertZoneForOrgVariables>;
```

### Variables
The `InsertZoneForOrg` Mutation requires an argument of type `InsertZoneForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `InsertZoneForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `InsertZoneForOrg` Mutation is of type `InsertZoneForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface InsertZoneForOrgData {
  zone_insert: Zone_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `InsertZoneForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, InsertZoneForOrgVariables } from '@dataconnect/generated';
import { useInsertZoneForOrg } from '@dataconnect/generated/react'

export default function InsertZoneForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useInsertZoneForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useInsertZoneForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertZoneForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertZoneForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useInsertZoneForOrg` Mutation requires an argument of type `InsertZoneForOrgVariables`:
  const insertZoneForOrgVars: InsertZoneForOrgVariables = {
    orgId: ..., 
    zoneId: ..., 
    clientId: ..., // optional
    zone: ..., // optional
    function: ..., // optional
    editedBy: ..., // optional
    date: ..., // optional
    location: ..., // optional
  };
  mutation.mutate(insertZoneForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., zoneId: ..., clientId: ..., zone: ..., function: ..., editedBy: ..., date: ..., location: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(insertZoneForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.zone_insert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## UpdateZoneForOrg
You can execute the `UpdateZoneForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useUpdateZoneForOrg(options?: useDataConnectMutationOptions<UpdateZoneForOrgData, FirebaseError, UpdateZoneForOrgVariables>): UseDataConnectMutationResult<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useUpdateZoneForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateZoneForOrgData, FirebaseError, UpdateZoneForOrgVariables>): UseDataConnectMutationResult<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;
```

### Variables
The `UpdateZoneForOrg` Mutation requires an argument of type `UpdateZoneForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `UpdateZoneForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `UpdateZoneForOrg` Mutation is of type `UpdateZoneForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface UpdateZoneForOrgData {
  zone_update?: Zone_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `UpdateZoneForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, UpdateZoneForOrgVariables } from '@dataconnect/generated';
import { useUpdateZoneForOrg } from '@dataconnect/generated/react'

export default function UpdateZoneForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useUpdateZoneForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useUpdateZoneForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateZoneForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateZoneForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useUpdateZoneForOrg` Mutation requires an argument of type `UpdateZoneForOrgVariables`:
  const updateZoneForOrgVars: UpdateZoneForOrgVariables = {
    orgId: ..., 
    zoneId: ..., 
    clientId: ..., // optional
    zone: ..., // optional
    function: ..., // optional
    editedBy: ..., // optional
    date: ..., // optional
    location: ..., // optional
  };
  mutation.mutate(updateZoneForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., zoneId: ..., clientId: ..., zone: ..., function: ..., editedBy: ..., date: ..., location: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(updateZoneForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.zone_update);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## DeleteZoneForOrg
You can execute the `DeleteZoneForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useDeleteZoneForOrg(options?: useDataConnectMutationOptions<DeleteZoneForOrgData, FirebaseError, DeleteZoneForOrgVariables>): UseDataConnectMutationResult<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useDeleteZoneForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteZoneForOrgData, FirebaseError, DeleteZoneForOrgVariables>): UseDataConnectMutationResult<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;
```

### Variables
The `DeleteZoneForOrg` Mutation requires an argument of type `DeleteZoneForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface DeleteZoneForOrgVariables {
  orgId: string;
  zoneId: string;
}
```
### Return Type
Recall that calling the `DeleteZoneForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `DeleteZoneForOrg` Mutation is of type `DeleteZoneForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface DeleteZoneForOrgData {
  zone_delete?: Zone_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `DeleteZoneForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, DeleteZoneForOrgVariables } from '@dataconnect/generated';
import { useDeleteZoneForOrg } from '@dataconnect/generated/react'

export default function DeleteZoneForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useDeleteZoneForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useDeleteZoneForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteZoneForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteZoneForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useDeleteZoneForOrg` Mutation requires an argument of type `DeleteZoneForOrgVariables`:
  const deleteZoneForOrgVars: DeleteZoneForOrgVariables = {
    orgId: ..., 
    zoneId: ..., 
  };
  mutation.mutate(deleteZoneForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., zoneId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(deleteZoneForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.zone_delete);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## InsertWorkdayForOrg
You can execute the `InsertWorkdayForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useInsertWorkdayForOrg(options?: useDataConnectMutationOptions<InsertWorkdayForOrgData, FirebaseError, InsertWorkdayForOrgVariables>): UseDataConnectMutationResult<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useInsertWorkdayForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertWorkdayForOrgData, FirebaseError, InsertWorkdayForOrgVariables>): UseDataConnectMutationResult<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;
```

### Variables
The `InsertWorkdayForOrg` Mutation requires an argument of type `InsertWorkdayForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `InsertWorkdayForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `InsertWorkdayForOrg` Mutation is of type `InsertWorkdayForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface InsertWorkdayForOrgData {
  workday_insert: Workday_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `InsertWorkdayForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, InsertWorkdayForOrgVariables } from '@dataconnect/generated';
import { useInsertWorkdayForOrg } from '@dataconnect/generated/react'

export default function InsertWorkdayForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useInsertWorkdayForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useInsertWorkdayForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertWorkdayForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertWorkdayForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useInsertWorkdayForOrg` Mutation requires an argument of type `InsertWorkdayForOrgVariables`:
  const insertWorkdayForOrgVars: InsertWorkdayForOrgVariables = {
    orgId: ..., 
    workdayId: ..., 
    workerLogin: ..., 
    workerName: ..., // optional
    utilityRoomId: ..., // optional
    startAt: ..., // optional
    endAt: ..., // optional
    durationSec: ..., // optional
    status: ..., // optional
    gps: ..., // optional
    comment: ..., // optional
    updatedBy: ..., // optional
  };
  mutation.mutate(insertWorkdayForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., workdayId: ..., workerLogin: ..., workerName: ..., utilityRoomId: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., gps: ..., comment: ..., updatedBy: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(insertWorkdayForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.workday_insert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## UpdateWorkdayForOrg
You can execute the `UpdateWorkdayForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useUpdateWorkdayForOrg(options?: useDataConnectMutationOptions<UpdateWorkdayForOrgData, FirebaseError, UpdateWorkdayForOrgVariables>): UseDataConnectMutationResult<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useUpdateWorkdayForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateWorkdayForOrgData, FirebaseError, UpdateWorkdayForOrgVariables>): UseDataConnectMutationResult<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;
```

### Variables
The `UpdateWorkdayForOrg` Mutation requires an argument of type `UpdateWorkdayForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `UpdateWorkdayForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `UpdateWorkdayForOrg` Mutation is of type `UpdateWorkdayForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface UpdateWorkdayForOrgData {
  workday_update?: Workday_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `UpdateWorkdayForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, UpdateWorkdayForOrgVariables } from '@dataconnect/generated';
import { useUpdateWorkdayForOrg } from '@dataconnect/generated/react'

export default function UpdateWorkdayForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useUpdateWorkdayForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useUpdateWorkdayForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateWorkdayForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateWorkdayForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useUpdateWorkdayForOrg` Mutation requires an argument of type `UpdateWorkdayForOrgVariables`:
  const updateWorkdayForOrgVars: UpdateWorkdayForOrgVariables = {
    orgId: ..., 
    workdayId: ..., 
    workerLogin: ..., 
    workerName: ..., // optional
    utilityRoomId: ..., // optional
    startAt: ..., // optional
    endAt: ..., // optional
    durationSec: ..., // optional
    status: ..., // optional
    gps: ..., // optional
    comment: ..., // optional
    updatedBy: ..., // optional
  };
  mutation.mutate(updateWorkdayForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., workdayId: ..., workerLogin: ..., workerName: ..., utilityRoomId: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., gps: ..., comment: ..., updatedBy: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(updateWorkdayForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.workday_update);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## DeleteWorkdayForOrg
You can execute the `DeleteWorkdayForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useDeleteWorkdayForOrg(options?: useDataConnectMutationOptions<DeleteWorkdayForOrgData, FirebaseError, DeleteWorkdayForOrgVariables>): UseDataConnectMutationResult<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useDeleteWorkdayForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteWorkdayForOrgData, FirebaseError, DeleteWorkdayForOrgVariables>): UseDataConnectMutationResult<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;
```

### Variables
The `DeleteWorkdayForOrg` Mutation requires an argument of type `DeleteWorkdayForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface DeleteWorkdayForOrgVariables {
  orgId: string;
  workdayId: string;
}
```
### Return Type
Recall that calling the `DeleteWorkdayForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `DeleteWorkdayForOrg` Mutation is of type `DeleteWorkdayForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface DeleteWorkdayForOrgData {
  workday_delete?: Workday_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `DeleteWorkdayForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, DeleteWorkdayForOrgVariables } from '@dataconnect/generated';
import { useDeleteWorkdayForOrg } from '@dataconnect/generated/react'

export default function DeleteWorkdayForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useDeleteWorkdayForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useDeleteWorkdayForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteWorkdayForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteWorkdayForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useDeleteWorkdayForOrg` Mutation requires an argument of type `DeleteWorkdayForOrgVariables`:
  const deleteWorkdayForOrgVars: DeleteWorkdayForOrgVariables = {
    orgId: ..., 
    workdayId: ..., 
  };
  mutation.mutate(deleteWorkdayForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., workdayId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(deleteWorkdayForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.workday_delete);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## InsertEventForOrg
You can execute the `InsertEventForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useInsertEventForOrg(options?: useDataConnectMutationOptions<InsertEventForOrgData, FirebaseError, InsertEventForOrgVariables>): UseDataConnectMutationResult<InsertEventForOrgData, InsertEventForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useInsertEventForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertEventForOrgData, FirebaseError, InsertEventForOrgVariables>): UseDataConnectMutationResult<InsertEventForOrgData, InsertEventForOrgVariables>;
```

### Variables
The `InsertEventForOrg` Mutation requires an argument of type `InsertEventForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `InsertEventForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `InsertEventForOrg` Mutation is of type `InsertEventForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface InsertEventForOrgData {
  event_insert: Event_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `InsertEventForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, InsertEventForOrgVariables } from '@dataconnect/generated';
import { useInsertEventForOrg } from '@dataconnect/generated/react'

export default function InsertEventForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useInsertEventForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useInsertEventForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertEventForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertEventForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useInsertEventForOrg` Mutation requires an argument of type `InsertEventForOrgVariables`:
  const insertEventForOrgVars: InsertEventForOrgVariables = {
    orgId: ..., 
    eventId: ..., 
    zoneId: ..., // optional
    workerLogin: ..., // optional
    workerName: ..., // optional
    startAt: ..., // optional
    endAt: ..., // optional
    durationSec: ..., // optional
    status: ..., // optional
    closeMarkedAt: ..., // optional
    endReason: ..., // optional
    comment: ..., // optional
    deviceId: ..., // optional
    startEventId: ..., // optional
    endEventId: ..., // optional
  };
  mutation.mutate(insertEventForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., eventId: ..., zoneId: ..., workerLogin: ..., workerName: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., closeMarkedAt: ..., endReason: ..., comment: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(insertEventForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.event_insert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## UpdateEventForOrg
You can execute the `UpdateEventForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useUpdateEventForOrg(options?: useDataConnectMutationOptions<UpdateEventForOrgData, FirebaseError, UpdateEventForOrgVariables>): UseDataConnectMutationResult<UpdateEventForOrgData, UpdateEventForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useUpdateEventForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateEventForOrgData, FirebaseError, UpdateEventForOrgVariables>): UseDataConnectMutationResult<UpdateEventForOrgData, UpdateEventForOrgVariables>;
```

### Variables
The `UpdateEventForOrg` Mutation requires an argument of type `UpdateEventForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `UpdateEventForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `UpdateEventForOrg` Mutation is of type `UpdateEventForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface UpdateEventForOrgData {
  event_update?: Event_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `UpdateEventForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, UpdateEventForOrgVariables } from '@dataconnect/generated';
import { useUpdateEventForOrg } from '@dataconnect/generated/react'

export default function UpdateEventForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useUpdateEventForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useUpdateEventForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateEventForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateEventForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useUpdateEventForOrg` Mutation requires an argument of type `UpdateEventForOrgVariables`:
  const updateEventForOrgVars: UpdateEventForOrgVariables = {
    orgId: ..., 
    eventId: ..., 
    workerName: ..., // optional
    endAt: ..., // optional
    durationSec: ..., // optional
    status: ..., // optional
    closeMarkedAt: ..., // optional
    endReason: ..., // optional
    comment: ..., // optional
    deviceId: ..., // optional
    startEventId: ..., // optional
    endEventId: ..., // optional
  };
  mutation.mutate(updateEventForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., eventId: ..., workerName: ..., endAt: ..., durationSec: ..., status: ..., closeMarkedAt: ..., endReason: ..., comment: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(updateEventForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.event_update);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## ReidentifyEventForOrg
You can execute the `ReidentifyEventForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useReidentifyEventForOrg(options?: useDataConnectMutationOptions<ReidentifyEventForOrgData, FirebaseError, ReidentifyEventForOrgVariables>): UseDataConnectMutationResult<ReidentifyEventForOrgData, ReidentifyEventForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useReidentifyEventForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<ReidentifyEventForOrgData, FirebaseError, ReidentifyEventForOrgVariables>): UseDataConnectMutationResult<ReidentifyEventForOrgData, ReidentifyEventForOrgVariables>;
```

### Variables
The `ReidentifyEventForOrg` Mutation requires an argument of type `ReidentifyEventForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `ReidentifyEventForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `ReidentifyEventForOrg` Mutation is of type `ReidentifyEventForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface ReidentifyEventForOrgData {
  event_update?: Event_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `ReidentifyEventForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, ReidentifyEventForOrgVariables } from '@dataconnect/generated';
import { useReidentifyEventForOrg } from '@dataconnect/generated/react'

export default function ReidentifyEventForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useReidentifyEventForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useReidentifyEventForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useReidentifyEventForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useReidentifyEventForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useReidentifyEventForOrg` Mutation requires an argument of type `ReidentifyEventForOrgVariables`:
  const reidentifyEventForOrgVars: ReidentifyEventForOrgVariables = {
    orgId: ..., 
    eventId: ..., 
    zoneId: ..., // optional
    workerLogin: ..., // optional
    workerName: ..., // optional
    startAt: ..., // optional
    endAt: ..., // optional
    durationSec: ..., // optional
    status: ..., // optional
    closeMarkedAt: ..., // optional
    endReason: ..., // optional
    comment: ..., // optional
    deviceId: ..., // optional
    startEventId: ..., // optional
    endEventId: ..., // optional
  };
  mutation.mutate(reidentifyEventForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., eventId: ..., zoneId: ..., workerLogin: ..., workerName: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., closeMarkedAt: ..., endReason: ..., comment: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(reidentifyEventForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.event_update);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## DeleteEventForOrg
You can execute the `DeleteEventForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useDeleteEventForOrg(options?: useDataConnectMutationOptions<DeleteEventForOrgData, FirebaseError, DeleteEventForOrgVariables>): UseDataConnectMutationResult<DeleteEventForOrgData, DeleteEventForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useDeleteEventForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteEventForOrgData, FirebaseError, DeleteEventForOrgVariables>): UseDataConnectMutationResult<DeleteEventForOrgData, DeleteEventForOrgVariables>;
```

### Variables
The `DeleteEventForOrg` Mutation requires an argument of type `DeleteEventForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface DeleteEventForOrgVariables {
  orgId: string;
  eventId: string;
}
```
### Return Type
Recall that calling the `DeleteEventForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `DeleteEventForOrg` Mutation is of type `DeleteEventForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface DeleteEventForOrgData {
  event_delete?: Event_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `DeleteEventForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, DeleteEventForOrgVariables } from '@dataconnect/generated';
import { useDeleteEventForOrg } from '@dataconnect/generated/react'

export default function DeleteEventForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useDeleteEventForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useDeleteEventForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteEventForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteEventForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useDeleteEventForOrg` Mutation requires an argument of type `DeleteEventForOrgVariables`:
  const deleteEventForOrgVars: DeleteEventForOrgVariables = {
    orgId: ..., 
    eventId: ..., 
  };
  mutation.mutate(deleteEventForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., eventId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(deleteEventForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.event_delete);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## InsertBackupCycleForOrg
You can execute the `InsertBackupCycleForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useInsertBackupCycleForOrg(options?: useDataConnectMutationOptions<InsertBackupCycleForOrgData, FirebaseError, InsertBackupCycleForOrgVariables>): UseDataConnectMutationResult<InsertBackupCycleForOrgData, InsertBackupCycleForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useInsertBackupCycleForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertBackupCycleForOrgData, FirebaseError, InsertBackupCycleForOrgVariables>): UseDataConnectMutationResult<InsertBackupCycleForOrgData, InsertBackupCycleForOrgVariables>;
```

### Variables
The `InsertBackupCycleForOrg` Mutation requires an argument of type `InsertBackupCycleForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `InsertBackupCycleForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `InsertBackupCycleForOrg` Mutation is of type `InsertBackupCycleForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface InsertBackupCycleForOrgData {
  backupCycle_insert: BackupCycle_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `InsertBackupCycleForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, InsertBackupCycleForOrgVariables } from '@dataconnect/generated';
import { useInsertBackupCycleForOrg } from '@dataconnect/generated/react'

export default function InsertBackupCycleForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useInsertBackupCycleForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useInsertBackupCycleForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertBackupCycleForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertBackupCycleForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useInsertBackupCycleForOrg` Mutation requires an argument of type `InsertBackupCycleForOrgVariables`:
  const insertBackupCycleForOrgVars: InsertBackupCycleForOrgVariables = {
    orgId: ..., 
    cycleId: ..., 
    workerLogin: ..., // optional
    workerName: ..., // optional
    roomId: ..., // optional
    strefa: ..., // optional
    pomieszczenie: ..., // optional
    startAt: ..., // optional
    endAt: ..., // optional
    durationSec: ..., // optional
    endReason: ..., // optional
    comment: ..., // optional
    status: ..., // optional
    closeMarkedAt: ..., // optional
    deviceId: ..., // optional
    startEventId: ..., // optional
    endEventId: ..., // optional
  };
  mutation.mutate(insertBackupCycleForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., cycleId: ..., workerLogin: ..., workerName: ..., roomId: ..., strefa: ..., pomieszczenie: ..., startAt: ..., endAt: ..., durationSec: ..., endReason: ..., comment: ..., status: ..., closeMarkedAt: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(insertBackupCycleForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.backupCycle_insert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## UpdateBackupCycleForOrg
You can execute the `UpdateBackupCycleForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useUpdateBackupCycleForOrg(options?: useDataConnectMutationOptions<UpdateBackupCycleForOrgData, FirebaseError, UpdateBackupCycleForOrgVariables>): UseDataConnectMutationResult<UpdateBackupCycleForOrgData, UpdateBackupCycleForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useUpdateBackupCycleForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateBackupCycleForOrgData, FirebaseError, UpdateBackupCycleForOrgVariables>): UseDataConnectMutationResult<UpdateBackupCycleForOrgData, UpdateBackupCycleForOrgVariables>;
```

### Variables
The `UpdateBackupCycleForOrg` Mutation requires an argument of type `UpdateBackupCycleForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `UpdateBackupCycleForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `UpdateBackupCycleForOrg` Mutation is of type `UpdateBackupCycleForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface UpdateBackupCycleForOrgData {
  backupCycle_update?: BackupCycle_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `UpdateBackupCycleForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, UpdateBackupCycleForOrgVariables } from '@dataconnect/generated';
import { useUpdateBackupCycleForOrg } from '@dataconnect/generated/react'

export default function UpdateBackupCycleForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useUpdateBackupCycleForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useUpdateBackupCycleForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateBackupCycleForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateBackupCycleForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useUpdateBackupCycleForOrg` Mutation requires an argument of type `UpdateBackupCycleForOrgVariables`:
  const updateBackupCycleForOrgVars: UpdateBackupCycleForOrgVariables = {
    orgId: ..., 
    cycleId: ..., 
    workerLogin: ..., // optional
    workerName: ..., // optional
    roomId: ..., // optional
    strefa: ..., // optional
    pomieszczenie: ..., // optional
    startAt: ..., // optional
    endAt: ..., // optional
    durationSec: ..., // optional
    endReason: ..., // optional
    comment: ..., // optional
    status: ..., // optional
    closeMarkedAt: ..., // optional
    deviceId: ..., // optional
    startEventId: ..., // optional
    endEventId: ..., // optional
  };
  mutation.mutate(updateBackupCycleForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., cycleId: ..., workerLogin: ..., workerName: ..., roomId: ..., strefa: ..., pomieszczenie: ..., startAt: ..., endAt: ..., durationSec: ..., endReason: ..., comment: ..., status: ..., closeMarkedAt: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(updateBackupCycleForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.backupCycle_update);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## InsertStorageForOrg
You can execute the `InsertStorageForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useInsertStorageForOrg(options?: useDataConnectMutationOptions<InsertStorageForOrgData, FirebaseError, InsertStorageForOrgVariables>): UseDataConnectMutationResult<InsertStorageForOrgData, InsertStorageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useInsertStorageForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertStorageForOrgData, FirebaseError, InsertStorageForOrgVariables>): UseDataConnectMutationResult<InsertStorageForOrgData, InsertStorageForOrgVariables>;
```

### Variables
The `InsertStorageForOrg` Mutation requires an argument of type `InsertStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `InsertStorageForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `InsertStorageForOrg` Mutation is of type `InsertStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface InsertStorageForOrgData {
  storage_insert: Storage_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `InsertStorageForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, InsertStorageForOrgVariables } from '@dataconnect/generated';
import { useInsertStorageForOrg } from '@dataconnect/generated/react'

export default function InsertStorageForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useInsertStorageForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useInsertStorageForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertStorageForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertStorageForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useInsertStorageForOrg` Mutation requires an argument of type `InsertStorageForOrgVariables`:
  const insertStorageForOrgVars: InsertStorageForOrgVariables = {
    orgId: ..., 
    productIndex: ..., 
    productId: ..., 
    name: ..., 
    productType: ..., 
    quantity: ..., // optional
    quantityMin: ..., // optional
    quantityMax: ..., // optional
    description: ..., // optional
    qrCode: ..., // optional
  };
  mutation.mutate(insertStorageForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., productIndex: ..., productId: ..., name: ..., productType: ..., quantity: ..., quantityMin: ..., quantityMax: ..., description: ..., qrCode: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(insertStorageForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.storage_insert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## UpdateStorageForOrg
You can execute the `UpdateStorageForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useUpdateStorageForOrg(options?: useDataConnectMutationOptions<UpdateStorageForOrgData, FirebaseError, UpdateStorageForOrgVariables>): UseDataConnectMutationResult<UpdateStorageForOrgData, UpdateStorageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useUpdateStorageForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateStorageForOrgData, FirebaseError, UpdateStorageForOrgVariables>): UseDataConnectMutationResult<UpdateStorageForOrgData, UpdateStorageForOrgVariables>;
```

### Variables
The `UpdateStorageForOrg` Mutation requires an argument of type `UpdateStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `UpdateStorageForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `UpdateStorageForOrg` Mutation is of type `UpdateStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface UpdateStorageForOrgData {
  storage_update?: Storage_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `UpdateStorageForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, UpdateStorageForOrgVariables } from '@dataconnect/generated';
import { useUpdateStorageForOrg } from '@dataconnect/generated/react'

export default function UpdateStorageForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useUpdateStorageForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useUpdateStorageForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateStorageForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateStorageForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useUpdateStorageForOrg` Mutation requires an argument of type `UpdateStorageForOrgVariables`:
  const updateStorageForOrgVars: UpdateStorageForOrgVariables = {
    orgId: ..., 
    productIndex: ..., 
    productId: ..., // optional
    name: ..., // optional
    productType: ..., // optional
    quantity: ..., // optional
    quantityMin: ..., // optional
    quantityMax: ..., // optional
    description: ..., // optional
    qrCode: ..., // optional
  };
  mutation.mutate(updateStorageForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., productIndex: ..., productId: ..., name: ..., productType: ..., quantity: ..., quantityMin: ..., quantityMax: ..., description: ..., qrCode: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(updateStorageForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.storage_update);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## DeleteStorageForOrg
You can execute the `DeleteStorageForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useDeleteStorageForOrg(options?: useDataConnectMutationOptions<DeleteStorageForOrgData, FirebaseError, DeleteStorageForOrgVariables>): UseDataConnectMutationResult<DeleteStorageForOrgData, DeleteStorageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useDeleteStorageForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteStorageForOrgData, FirebaseError, DeleteStorageForOrgVariables>): UseDataConnectMutationResult<DeleteStorageForOrgData, DeleteStorageForOrgVariables>;
```

### Variables
The `DeleteStorageForOrg` Mutation requires an argument of type `DeleteStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface DeleteStorageForOrgVariables {
  orgId: string;
  productIndex: string;
}
```
### Return Type
Recall that calling the `DeleteStorageForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `DeleteStorageForOrg` Mutation is of type `DeleteStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface DeleteStorageForOrgData {
  storage_delete?: Storage_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `DeleteStorageForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, DeleteStorageForOrgVariables } from '@dataconnect/generated';
import { useDeleteStorageForOrg } from '@dataconnect/generated/react'

export default function DeleteStorageForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useDeleteStorageForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useDeleteStorageForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteStorageForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteStorageForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useDeleteStorageForOrg` Mutation requires an argument of type `DeleteStorageForOrgVariables`:
  const deleteStorageForOrgVars: DeleteStorageForOrgVariables = {
    orgId: ..., 
    productIndex: ..., 
  };
  mutation.mutate(deleteStorageForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., productIndex: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(deleteStorageForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.storage_delete);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## InsertClientStorageForOrg
You can execute the `InsertClientStorageForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useInsertClientStorageForOrg(options?: useDataConnectMutationOptions<InsertClientStorageForOrgData, FirebaseError, InsertClientStorageForOrgVariables>): UseDataConnectMutationResult<InsertClientStorageForOrgData, InsertClientStorageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useInsertClientStorageForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<InsertClientStorageForOrgData, FirebaseError, InsertClientStorageForOrgVariables>): UseDataConnectMutationResult<InsertClientStorageForOrgData, InsertClientStorageForOrgVariables>;
```

### Variables
The `InsertClientStorageForOrg` Mutation requires an argument of type `InsertClientStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `InsertClientStorageForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `InsertClientStorageForOrg` Mutation is of type `InsertClientStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface InsertClientStorageForOrgData {
  clientStorage_insert: ClientStorage_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `InsertClientStorageForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, InsertClientStorageForOrgVariables } from '@dataconnect/generated';
import { useInsertClientStorageForOrg } from '@dataconnect/generated/react'

export default function InsertClientStorageForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useInsertClientStorageForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useInsertClientStorageForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertClientStorageForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useInsertClientStorageForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useInsertClientStorageForOrg` Mutation requires an argument of type `InsertClientStorageForOrgVariables`:
  const insertClientStorageForOrgVars: InsertClientStorageForOrgVariables = {
    orgId: ..., 
    clientId: ..., 
    productIndex: ..., 
    name: ..., 
    productType: ..., 
    quantity: ..., // optional
    quantityMin: ..., // optional
    quantityMax: ..., // optional
    qrCode: ..., // optional
  };
  mutation.mutate(insertClientStorageForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., clientId: ..., productIndex: ..., name: ..., productType: ..., quantity: ..., quantityMin: ..., quantityMax: ..., qrCode: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(insertClientStorageForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.clientStorage_insert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## UpdateClientStorageForOrg
You can execute the `UpdateClientStorageForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useUpdateClientStorageForOrg(options?: useDataConnectMutationOptions<UpdateClientStorageForOrgData, FirebaseError, UpdateClientStorageForOrgVariables>): UseDataConnectMutationResult<UpdateClientStorageForOrgData, UpdateClientStorageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useUpdateClientStorageForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateClientStorageForOrgData, FirebaseError, UpdateClientStorageForOrgVariables>): UseDataConnectMutationResult<UpdateClientStorageForOrgData, UpdateClientStorageForOrgVariables>;
```

### Variables
The `UpdateClientStorageForOrg` Mutation requires an argument of type `UpdateClientStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `UpdateClientStorageForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `UpdateClientStorageForOrg` Mutation is of type `UpdateClientStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface UpdateClientStorageForOrgData {
  clientStorage_update?: ClientStorage_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `UpdateClientStorageForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, UpdateClientStorageForOrgVariables } from '@dataconnect/generated';
import { useUpdateClientStorageForOrg } from '@dataconnect/generated/react'

export default function UpdateClientStorageForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useUpdateClientStorageForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useUpdateClientStorageForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateClientStorageForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateClientStorageForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useUpdateClientStorageForOrg` Mutation requires an argument of type `UpdateClientStorageForOrgVariables`:
  const updateClientStorageForOrgVars: UpdateClientStorageForOrgVariables = {
    orgId: ..., 
    clientId: ..., 
    productIndex: ..., 
    name: ..., // optional
    productType: ..., // optional
    quantity: ..., // optional
    quantityMin: ..., // optional
    quantityMax: ..., // optional
    qrCode: ..., // optional
  };
  mutation.mutate(updateClientStorageForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., clientId: ..., productIndex: ..., name: ..., productType: ..., quantity: ..., quantityMin: ..., quantityMax: ..., qrCode: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(updateClientStorageForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.clientStorage_update);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## DeleteClientStorageForOrg
You can execute the `DeleteClientStorageForOrg` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useDeleteClientStorageForOrg(options?: useDataConnectMutationOptions<DeleteClientStorageForOrgData, FirebaseError, DeleteClientStorageForOrgVariables>): UseDataConnectMutationResult<DeleteClientStorageForOrgData, DeleteClientStorageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useDeleteClientStorageForOrg(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteClientStorageForOrgData, FirebaseError, DeleteClientStorageForOrgVariables>): UseDataConnectMutationResult<DeleteClientStorageForOrgData, DeleteClientStorageForOrgVariables>;
```

### Variables
The `DeleteClientStorageForOrg` Mutation requires an argument of type `DeleteClientStorageForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface DeleteClientStorageForOrgVariables {
  orgId: string;
  clientId: string;
  productIndex: string;
}
```
### Return Type
Recall that calling the `DeleteClientStorageForOrg` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `DeleteClientStorageForOrg` Mutation is of type `DeleteClientStorageForOrgData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface DeleteClientStorageForOrgData {
  clientStorage_delete?: ClientStorage_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `DeleteClientStorageForOrg`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, DeleteClientStorageForOrgVariables } from '@dataconnect/generated';
import { useDeleteClientStorageForOrg } from '@dataconnect/generated/react'

export default function DeleteClientStorageForOrgComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useDeleteClientStorageForOrg();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useDeleteClientStorageForOrg(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteClientStorageForOrg(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useDeleteClientStorageForOrg(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useDeleteClientStorageForOrg` Mutation requires an argument of type `DeleteClientStorageForOrgVariables`:
  const deleteClientStorageForOrgVars: DeleteClientStorageForOrgVariables = {
    orgId: ..., 
    clientId: ..., 
    productIndex: ..., 
  };
  mutation.mutate(deleteClientStorageForOrgVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., clientId: ..., productIndex: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(deleteClientStorageForOrgVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.clientStorage_delete);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## StartWorkdayPause
You can execute the `StartWorkdayPause` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useStartWorkdayPause(options?: useDataConnectMutationOptions<StartWorkdayPauseData, FirebaseError, StartWorkdayPauseVariables>): UseDataConnectMutationResult<StartWorkdayPauseData, StartWorkdayPauseVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useStartWorkdayPause(dc: DataConnect, options?: useDataConnectMutationOptions<StartWorkdayPauseData, FirebaseError, StartWorkdayPauseVariables>): UseDataConnectMutationResult<StartWorkdayPauseData, StartWorkdayPauseVariables>;
```

### Variables
The `StartWorkdayPause` Mutation requires an argument of type `StartWorkdayPauseVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
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
```
### Return Type
Recall that calling the `StartWorkdayPause` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `StartWorkdayPause` Mutation is of type `StartWorkdayPauseData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface StartWorkdayPauseData {
  workdayPause_insert: WorkdayPause_Key;
  workday_update?: Workday_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `StartWorkdayPause`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, StartWorkdayPauseVariables } from '@dataconnect/generated';
import { useStartWorkdayPause } from '@dataconnect/generated/react'

export default function StartWorkdayPauseComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useStartWorkdayPause();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useStartWorkdayPause(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useStartWorkdayPause(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useStartWorkdayPause(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useStartWorkdayPause` Mutation requires an argument of type `StartWorkdayPauseVariables`:
  const startWorkdayPauseVars: StartWorkdayPauseVariables = {
    orgId: ..., 
    pauseId: ..., 
    workdayId: ..., 
    workerLogin: ..., 
    workerName: ..., // optional
    startAt: ..., // optional
    stopAt: ..., // optional
    durationSec: ..., // optional
    status: ..., // optional
    pauseEventId: ..., // optional
    deviceId: ..., // optional
  };
  mutation.mutate(startWorkdayPauseVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., pauseId: ..., workdayId: ..., workerLogin: ..., workerName: ..., startAt: ..., stopAt: ..., durationSec: ..., status: ..., pauseEventId: ..., deviceId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(startWorkdayPauseVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.workdayPause_insert);
    console.log(mutation.data.workday_update);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## StopWorkdayPause
You can execute the `StopWorkdayPause` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect-generated/react/index.d.ts](./index.d.ts)):
```javascript
useStopWorkdayPause(options?: useDataConnectMutationOptions<StopWorkdayPauseData, FirebaseError, StopWorkdayPauseVariables>): UseDataConnectMutationResult<StopWorkdayPauseData, StopWorkdayPauseVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useStopWorkdayPause(dc: DataConnect, options?: useDataConnectMutationOptions<StopWorkdayPauseData, FirebaseError, StopWorkdayPauseVariables>): UseDataConnectMutationResult<StopWorkdayPauseData, StopWorkdayPauseVariables>;
```

### Variables
The `StopWorkdayPause` Mutation requires an argument of type `StopWorkdayPauseVariables`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface StopWorkdayPauseVariables {
  orgId: string;
  pauseId: string;
  workdayId: string;
  workerLogin?: string | null;
  stopAt?: TimestampString | null;
  durationSec?: number | null;
  status?: string | null;
}
```
### Return Type
Recall that calling the `StopWorkdayPause` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `StopWorkdayPause` Mutation is of type `StopWorkdayPauseData`, which is defined in [dataconnect-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface StopWorkdayPauseData {
  workdayPause_update?: WorkdayPause_Key | null;
  workday_update?: Workday_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `StopWorkdayPause`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, StopWorkdayPauseVariables } from '@dataconnect/generated';
import { useStopWorkdayPause } from '@dataconnect/generated/react'

export default function StopWorkdayPauseComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useStopWorkdayPause();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useStopWorkdayPause(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useStopWorkdayPause(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useStopWorkdayPause(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useStopWorkdayPause` Mutation requires an argument of type `StopWorkdayPauseVariables`:
  const stopWorkdayPauseVars: StopWorkdayPauseVariables = {
    orgId: ..., 
    pauseId: ..., 
    workdayId: ..., 
    workerLogin: ..., // optional
    stopAt: ..., // optional
    durationSec: ..., // optional
    status: ..., // optional
  };
  mutation.mutate(stopWorkdayPauseVars);
  // Variables can be defined inline as well.
  mutation.mutate({ orgId: ..., pauseId: ..., workdayId: ..., workerLogin: ..., stopAt: ..., durationSec: ..., status: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(stopWorkdayPauseVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.workdayPause_update);
    console.log(mutation.data.workday_update);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

