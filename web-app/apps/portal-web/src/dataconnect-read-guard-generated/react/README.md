# Generated React README
This README will guide you through the process of using the generated React SDK package for the connector `read-guard`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `JavaScript README`, you can find it at [`dataconnect-read-guard-generated/README.md`](../README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

You can use this generated SDK by importing from the package `@dataconnect/read-guard-generated/react` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#react).

# Table of Contents
- [**Overview**](#generated-react-readme)
- [**TanStack Query Firebase & TanStack React Query**](#tanstack-query-firebase-tanstack-react-query)
  - [*Package Installation*](#installing-tanstack-query-firebase-and-tanstack-react-query-packages)
  - [*Configuring TanStack Query*](#configuring-tanstack-query)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*WorkersPageForOrg*](#workerspagefororg)
  - [*WorkerForOrgByLogin*](#workerfororgbylogin)
  - [*ClientsPageForOrg*](#clientspagefororg)
  - [*ZonesPageForOrg*](#zonespagefororg)
  - [*BackupCyclesPageForOrg*](#backupcyclespagefororg)
  - [*WorkdayPausesPageForOrg*](#workdaypausespagefororg)
- [**Mutations**](#mutations)

# TanStack Query Firebase & TanStack React Query
This SDK provides [React](https://react.dev/) hooks generated specific to your application, for the operations found in the connector `read-guard`. These hooks are generated using [TanStack Query Firebase](https://react-query-firebase.invertase.dev/) by our partners at Invertase, a library built on top of [TanStack React Query v5](https://tanstack.com/query/v5/docs/framework/react/overview).

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
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `read-guard`.

You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/read-guard-generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#emulator-react-angular).

```javascript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/read-guard-generated';

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

Below are examples of how to use the `read-guard` connector's generated Query hook functions to execute each Query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#operations-react-angular).

## WorkersPageForOrg
You can execute the `WorkersPageForOrg` Query using the following Query hook function, which is defined in [dataconnect-read-guard-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkersPageForOrg(dc: DataConnect, vars: WorkersPageForOrgVariables, options?: useDataConnectQueryOptions<WorkersPageForOrgData>): UseDataConnectQueryResult<WorkersPageForOrgData, WorkersPageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkersPageForOrg(vars: WorkersPageForOrgVariables, options?: useDataConnectQueryOptions<WorkersPageForOrgData>): UseDataConnectQueryResult<WorkersPageForOrgData, WorkersPageForOrgVariables>;
```

### Variables
The `WorkersPageForOrg` Query requires an argument of type `WorkersPageForOrgVariables`, which is defined in [dataconnect-read-guard-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkersPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `WorkersPageForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkersPageForOrg` Query is of type `WorkersPageForOrgData`, which is defined in [dataconnect-read-guard-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkersPageForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkersPageForOrgVariables } from '@dataconnect/read-guard-generated';
import { useWorkersPageForOrg } from '@dataconnect/read-guard-generated/react'

export default function WorkersPageForOrgComponent() {
  // The `useWorkersPageForOrg` Query hook requires an argument of type `WorkersPageForOrgVariables`:
  const workersPageForOrgVars: WorkersPageForOrgVariables = {
    orgId: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkersPageForOrg(workersPageForOrgVars);
  // Variables can be defined inline as well.
  const query = useWorkersPageForOrg({ orgId: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkersPageForOrg(dataConnect, workersPageForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkersPageForOrg(workersPageForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkersPageForOrg(dataConnect, workersPageForOrgVars, options);

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

## WorkerForOrgByLogin
You can execute the `WorkerForOrgByLogin` Query using the following Query hook function, which is defined in [dataconnect-read-guard-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkerForOrgByLogin(dc: DataConnect, vars: WorkerForOrgByLoginVariables, options?: useDataConnectQueryOptions<WorkerForOrgByLoginData>): UseDataConnectQueryResult<WorkerForOrgByLoginData, WorkerForOrgByLoginVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkerForOrgByLogin(vars: WorkerForOrgByLoginVariables, options?: useDataConnectQueryOptions<WorkerForOrgByLoginData>): UseDataConnectQueryResult<WorkerForOrgByLoginData, WorkerForOrgByLoginVariables>;
```

### Variables
The `WorkerForOrgByLogin` Query requires an argument of type `WorkerForOrgByLoginVariables`, which is defined in [dataconnect-read-guard-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkerForOrgByLoginVariables {
  orgId: string;
  workerLogin: string;
}
```
### Return Type
Recall that calling the `WorkerForOrgByLogin` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkerForOrgByLogin` Query is of type `WorkerForOrgByLoginData`, which is defined in [dataconnect-read-guard-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkerForOrgByLogin`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkerForOrgByLoginVariables } from '@dataconnect/read-guard-generated';
import { useWorkerForOrgByLogin } from '@dataconnect/read-guard-generated/react'

export default function WorkerForOrgByLoginComponent() {
  // The `useWorkerForOrgByLogin` Query hook requires an argument of type `WorkerForOrgByLoginVariables`:
  const workerForOrgByLoginVars: WorkerForOrgByLoginVariables = {
    orgId: ..., 
    workerLogin: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkerForOrgByLogin(workerForOrgByLoginVars);
  // Variables can be defined inline as well.
  const query = useWorkerForOrgByLogin({ orgId: ..., workerLogin: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkerForOrgByLogin(dataConnect, workerForOrgByLoginVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkerForOrgByLogin(workerForOrgByLoginVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkerForOrgByLogin(dataConnect, workerForOrgByLoginVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.worker);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## ClientsPageForOrg
You can execute the `ClientsPageForOrg` Query using the following Query hook function, which is defined in [dataconnect-read-guard-generated/react/index.d.ts](./index.d.ts):

```javascript
useClientsPageForOrg(dc: DataConnect, vars: ClientsPageForOrgVariables, options?: useDataConnectQueryOptions<ClientsPageForOrgData>): UseDataConnectQueryResult<ClientsPageForOrgData, ClientsPageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useClientsPageForOrg(vars: ClientsPageForOrgVariables, options?: useDataConnectQueryOptions<ClientsPageForOrgData>): UseDataConnectQueryResult<ClientsPageForOrgData, ClientsPageForOrgVariables>;
```

### Variables
The `ClientsPageForOrg` Query requires an argument of type `ClientsPageForOrgVariables`, which is defined in [dataconnect-read-guard-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface ClientsPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `ClientsPageForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `ClientsPageForOrg` Query is of type `ClientsPageForOrgData`, which is defined in [dataconnect-read-guard-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `ClientsPageForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, ClientsPageForOrgVariables } from '@dataconnect/read-guard-generated';
import { useClientsPageForOrg } from '@dataconnect/read-guard-generated/react'

export default function ClientsPageForOrgComponent() {
  // The `useClientsPageForOrg` Query hook requires an argument of type `ClientsPageForOrgVariables`:
  const clientsPageForOrgVars: ClientsPageForOrgVariables = {
    orgId: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useClientsPageForOrg(clientsPageForOrgVars);
  // Variables can be defined inline as well.
  const query = useClientsPageForOrg({ orgId: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useClientsPageForOrg(dataConnect, clientsPageForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useClientsPageForOrg(clientsPageForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useClientsPageForOrg(dataConnect, clientsPageForOrgVars, options);

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

## ZonesPageForOrg
You can execute the `ZonesPageForOrg` Query using the following Query hook function, which is defined in [dataconnect-read-guard-generated/react/index.d.ts](./index.d.ts):

```javascript
useZonesPageForOrg(dc: DataConnect, vars: ZonesPageForOrgVariables, options?: useDataConnectQueryOptions<ZonesPageForOrgData>): UseDataConnectQueryResult<ZonesPageForOrgData, ZonesPageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useZonesPageForOrg(vars: ZonesPageForOrgVariables, options?: useDataConnectQueryOptions<ZonesPageForOrgData>): UseDataConnectQueryResult<ZonesPageForOrgData, ZonesPageForOrgVariables>;
```

### Variables
The `ZonesPageForOrg` Query requires an argument of type `ZonesPageForOrgVariables`, which is defined in [dataconnect-read-guard-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface ZonesPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `ZonesPageForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `ZonesPageForOrg` Query is of type `ZonesPageForOrgData`, which is defined in [dataconnect-read-guard-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface ZonesPageForOrgData {
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

### Using `ZonesPageForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, ZonesPageForOrgVariables } from '@dataconnect/read-guard-generated';
import { useZonesPageForOrg } from '@dataconnect/read-guard-generated/react'

export default function ZonesPageForOrgComponent() {
  // The `useZonesPageForOrg` Query hook requires an argument of type `ZonesPageForOrgVariables`:
  const zonesPageForOrgVars: ZonesPageForOrgVariables = {
    orgId: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useZonesPageForOrg(zonesPageForOrgVars);
  // Variables can be defined inline as well.
  const query = useZonesPageForOrg({ orgId: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useZonesPageForOrg(dataConnect, zonesPageForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useZonesPageForOrg(zonesPageForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useZonesPageForOrg(dataConnect, zonesPageForOrgVars, options);

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

## BackupCyclesPageForOrg
You can execute the `BackupCyclesPageForOrg` Query using the following Query hook function, which is defined in [dataconnect-read-guard-generated/react/index.d.ts](./index.d.ts):

```javascript
useBackupCyclesPageForOrg(dc: DataConnect, vars: BackupCyclesPageForOrgVariables, options?: useDataConnectQueryOptions<BackupCyclesPageForOrgData>): UseDataConnectQueryResult<BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useBackupCyclesPageForOrg(vars: BackupCyclesPageForOrgVariables, options?: useDataConnectQueryOptions<BackupCyclesPageForOrgData>): UseDataConnectQueryResult<BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables>;
```

### Variables
The `BackupCyclesPageForOrg` Query requires an argument of type `BackupCyclesPageForOrgVariables`, which is defined in [dataconnect-read-guard-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface BackupCyclesPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `BackupCyclesPageForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `BackupCyclesPageForOrg` Query is of type `BackupCyclesPageForOrgData`, which is defined in [dataconnect-read-guard-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `BackupCyclesPageForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, BackupCyclesPageForOrgVariables } from '@dataconnect/read-guard-generated';
import { useBackupCyclesPageForOrg } from '@dataconnect/read-guard-generated/react'

export default function BackupCyclesPageForOrgComponent() {
  // The `useBackupCyclesPageForOrg` Query hook requires an argument of type `BackupCyclesPageForOrgVariables`:
  const backupCyclesPageForOrgVars: BackupCyclesPageForOrgVariables = {
    orgId: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useBackupCyclesPageForOrg(backupCyclesPageForOrgVars);
  // Variables can be defined inline as well.
  const query = useBackupCyclesPageForOrg({ orgId: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useBackupCyclesPageForOrg(dataConnect, backupCyclesPageForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useBackupCyclesPageForOrg(backupCyclesPageForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useBackupCyclesPageForOrg(dataConnect, backupCyclesPageForOrgVars, options);

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

## WorkdayPausesPageForOrg
You can execute the `WorkdayPausesPageForOrg` Query using the following Query hook function, which is defined in [dataconnect-read-guard-generated/react/index.d.ts](./index.d.ts):

```javascript
useWorkdayPausesPageForOrg(dc: DataConnect, vars: WorkdayPausesPageForOrgVariables, options?: useDataConnectQueryOptions<WorkdayPausesPageForOrgData>): UseDataConnectQueryResult<WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useWorkdayPausesPageForOrg(vars: WorkdayPausesPageForOrgVariables, options?: useDataConnectQueryOptions<WorkdayPausesPageForOrgData>): UseDataConnectQueryResult<WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables>;
```

### Variables
The `WorkdayPausesPageForOrg` Query requires an argument of type `WorkdayPausesPageForOrgVariables`, which is defined in [dataconnect-read-guard-generated/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface WorkdayPausesPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that calling the `WorkdayPausesPageForOrg` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `WorkdayPausesPageForOrg` Query is of type `WorkdayPausesPageForOrgData`, which is defined in [dataconnect-read-guard-generated/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `WorkdayPausesPageForOrg`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, WorkdayPausesPageForOrgVariables } from '@dataconnect/read-guard-generated';
import { useWorkdayPausesPageForOrg } from '@dataconnect/read-guard-generated/react'

export default function WorkdayPausesPageForOrgComponent() {
  // The `useWorkdayPausesPageForOrg` Query hook requires an argument of type `WorkdayPausesPageForOrgVariables`:
  const workdayPausesPageForOrgVars: WorkdayPausesPageForOrgVariables = {
    orgId: ..., 
    limit: ..., // optional
    offset: ..., // optional
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useWorkdayPausesPageForOrg(workdayPausesPageForOrgVars);
  // Variables can be defined inline as well.
  const query = useWorkdayPausesPageForOrg({ orgId: ..., limit: ..., offset: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useWorkdayPausesPageForOrg(dataConnect, workdayPausesPageForOrgVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdayPausesPageForOrg(workdayPausesPageForOrgVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useWorkdayPausesPageForOrg(dataConnect, workdayPausesPageForOrgVars, options);

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

No Mutations were generated for the `read-guard` connector.

If you want to learn more about how to use Mutations in Data Connect, you can follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#operations-react-angular).

