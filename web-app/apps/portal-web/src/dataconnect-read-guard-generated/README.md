# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `read-guard`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-read-guard-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
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

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `read-guard`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/read-guard-generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/read-guard-generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/read-guard-generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `read-guard` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## WorkersPageForOrg
You can execute the `WorkersPageForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts):
```typescript
workersPageForOrg(vars: WorkersPageForOrgVariables): QueryPromise<WorkersPageForOrgData, WorkersPageForOrgVariables>;

interface WorkersPageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkersPageForOrgVariables): QueryRef<WorkersPageForOrgData, WorkersPageForOrgVariables>;
}
export const workersPageForOrgRef: WorkersPageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
workersPageForOrg(dc: DataConnect, vars: WorkersPageForOrgVariables): QueryPromise<WorkersPageForOrgData, WorkersPageForOrgVariables>;

interface WorkersPageForOrgRef {
  ...
  (dc: DataConnect, vars: WorkersPageForOrgVariables): QueryRef<WorkersPageForOrgData, WorkersPageForOrgVariables>;
}
export const workersPageForOrgRef: WorkersPageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the workersPageForOrgRef:
```typescript
const name = workersPageForOrgRef.operationName;
console.log(name);
```

### Variables
The `WorkersPageForOrg` query requires an argument of type `WorkersPageForOrgVariables`, which is defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface WorkersPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that executing the `WorkersPageForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `WorkersPageForOrgData`, which is defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `WorkersPageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, workersPageForOrg, WorkersPageForOrgVariables } from '@dataconnect/read-guard-generated';

// The `WorkersPageForOrg` query requires an argument of type `WorkersPageForOrgVariables`:
const workersPageForOrgVars: WorkersPageForOrgVariables = {
  orgId: ...,
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `workersPageForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await workersPageForOrg(workersPageForOrgVars);
// Variables can be defined inline as well.
const { data } = await workersPageForOrg({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await workersPageForOrg(dataConnect, workersPageForOrgVars);

console.log(data.organization);
console.log(data.workers);

// Or, you can use the `Promise` API.
workersPageForOrg(workersPageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.organization);
  console.log(data.workers);
});
```

### Using `WorkersPageForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, workersPageForOrgRef, WorkersPageForOrgVariables } from '@dataconnect/read-guard-generated';

// The `WorkersPageForOrg` query requires an argument of type `WorkersPageForOrgVariables`:
const workersPageForOrgVars: WorkersPageForOrgVariables = {
  orgId: ...,
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `workersPageForOrgRef()` function to get a reference to the query.
const ref = workersPageForOrgRef(workersPageForOrgVars);
// Variables can be defined inline as well.
const ref = workersPageForOrgRef({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = workersPageForOrgRef(dataConnect, workersPageForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.organization);
console.log(data.workers);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.organization);
  console.log(data.workers);
});
```

## WorkerForOrgByLogin
You can execute the `WorkerForOrgByLogin` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts):
```typescript
workerForOrgByLogin(vars: WorkerForOrgByLoginVariables): QueryPromise<WorkerForOrgByLoginData, WorkerForOrgByLoginVariables>;

interface WorkerForOrgByLoginRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkerForOrgByLoginVariables): QueryRef<WorkerForOrgByLoginData, WorkerForOrgByLoginVariables>;
}
export const workerForOrgByLoginRef: WorkerForOrgByLoginRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
workerForOrgByLogin(dc: DataConnect, vars: WorkerForOrgByLoginVariables): QueryPromise<WorkerForOrgByLoginData, WorkerForOrgByLoginVariables>;

interface WorkerForOrgByLoginRef {
  ...
  (dc: DataConnect, vars: WorkerForOrgByLoginVariables): QueryRef<WorkerForOrgByLoginData, WorkerForOrgByLoginVariables>;
}
export const workerForOrgByLoginRef: WorkerForOrgByLoginRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the workerForOrgByLoginRef:
```typescript
const name = workerForOrgByLoginRef.operationName;
console.log(name);
```

### Variables
The `WorkerForOrgByLogin` query requires an argument of type `WorkerForOrgByLoginVariables`, which is defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface WorkerForOrgByLoginVariables {
  orgId: string;
  workerLogin: string;
}
```
### Return Type
Recall that executing the `WorkerForOrgByLogin` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `WorkerForOrgByLoginData`, which is defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `WorkerForOrgByLogin`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, workerForOrgByLogin, WorkerForOrgByLoginVariables } from '@dataconnect/read-guard-generated';

// The `WorkerForOrgByLogin` query requires an argument of type `WorkerForOrgByLoginVariables`:
const workerForOrgByLoginVars: WorkerForOrgByLoginVariables = {
  orgId: ...,
  workerLogin: ...,
};

// Call the `workerForOrgByLogin()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await workerForOrgByLogin(workerForOrgByLoginVars);
// Variables can be defined inline as well.
const { data } = await workerForOrgByLogin({ orgId: ..., workerLogin: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await workerForOrgByLogin(dataConnect, workerForOrgByLoginVars);

console.log(data.worker);

// Or, you can use the `Promise` API.
workerForOrgByLogin(workerForOrgByLoginVars).then((response) => {
  const data = response.data;
  console.log(data.worker);
});
```

### Using `WorkerForOrgByLogin`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, workerForOrgByLoginRef, WorkerForOrgByLoginVariables } from '@dataconnect/read-guard-generated';

// The `WorkerForOrgByLogin` query requires an argument of type `WorkerForOrgByLoginVariables`:
const workerForOrgByLoginVars: WorkerForOrgByLoginVariables = {
  orgId: ...,
  workerLogin: ...,
};

// Call the `workerForOrgByLoginRef()` function to get a reference to the query.
const ref = workerForOrgByLoginRef(workerForOrgByLoginVars);
// Variables can be defined inline as well.
const ref = workerForOrgByLoginRef({ orgId: ..., workerLogin: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = workerForOrgByLoginRef(dataConnect, workerForOrgByLoginVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.worker);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.worker);
});
```

## ClientsPageForOrg
You can execute the `ClientsPageForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts):
```typescript
clientsPageForOrg(vars: ClientsPageForOrgVariables): QueryPromise<ClientsPageForOrgData, ClientsPageForOrgVariables>;

interface ClientsPageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ClientsPageForOrgVariables): QueryRef<ClientsPageForOrgData, ClientsPageForOrgVariables>;
}
export const clientsPageForOrgRef: ClientsPageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
clientsPageForOrg(dc: DataConnect, vars: ClientsPageForOrgVariables): QueryPromise<ClientsPageForOrgData, ClientsPageForOrgVariables>;

interface ClientsPageForOrgRef {
  ...
  (dc: DataConnect, vars: ClientsPageForOrgVariables): QueryRef<ClientsPageForOrgData, ClientsPageForOrgVariables>;
}
export const clientsPageForOrgRef: ClientsPageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the clientsPageForOrgRef:
```typescript
const name = clientsPageForOrgRef.operationName;
console.log(name);
```

### Variables
The `ClientsPageForOrg` query requires an argument of type `ClientsPageForOrgVariables`, which is defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ClientsPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that executing the `ClientsPageForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ClientsPageForOrgData`, which is defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `ClientsPageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, clientsPageForOrg, ClientsPageForOrgVariables } from '@dataconnect/read-guard-generated';

// The `ClientsPageForOrg` query requires an argument of type `ClientsPageForOrgVariables`:
const clientsPageForOrgVars: ClientsPageForOrgVariables = {
  orgId: ...,
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `clientsPageForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await clientsPageForOrg(clientsPageForOrgVars);
// Variables can be defined inline as well.
const { data } = await clientsPageForOrg({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await clientsPageForOrg(dataConnect, clientsPageForOrgVars);

console.log(data.clients);

// Or, you can use the `Promise` API.
clientsPageForOrg(clientsPageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.clients);
});
```

### Using `ClientsPageForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, clientsPageForOrgRef, ClientsPageForOrgVariables } from '@dataconnect/read-guard-generated';

// The `ClientsPageForOrg` query requires an argument of type `ClientsPageForOrgVariables`:
const clientsPageForOrgVars: ClientsPageForOrgVariables = {
  orgId: ...,
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `clientsPageForOrgRef()` function to get a reference to the query.
const ref = clientsPageForOrgRef(clientsPageForOrgVars);
// Variables can be defined inline as well.
const ref = clientsPageForOrgRef({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = clientsPageForOrgRef(dataConnect, clientsPageForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.clients);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.clients);
});
```

## ZonesPageForOrg
You can execute the `ZonesPageForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts):
```typescript
zonesPageForOrg(vars: ZonesPageForOrgVariables): QueryPromise<ZonesPageForOrgData, ZonesPageForOrgVariables>;

interface ZonesPageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ZonesPageForOrgVariables): QueryRef<ZonesPageForOrgData, ZonesPageForOrgVariables>;
}
export const zonesPageForOrgRef: ZonesPageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
zonesPageForOrg(dc: DataConnect, vars: ZonesPageForOrgVariables): QueryPromise<ZonesPageForOrgData, ZonesPageForOrgVariables>;

interface ZonesPageForOrgRef {
  ...
  (dc: DataConnect, vars: ZonesPageForOrgVariables): QueryRef<ZonesPageForOrgData, ZonesPageForOrgVariables>;
}
export const zonesPageForOrgRef: ZonesPageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the zonesPageForOrgRef:
```typescript
const name = zonesPageForOrgRef.operationName;
console.log(name);
```

### Variables
The `ZonesPageForOrg` query requires an argument of type `ZonesPageForOrgVariables`, which is defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ZonesPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that executing the `ZonesPageForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ZonesPageForOrgData`, which is defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `ZonesPageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, zonesPageForOrg, ZonesPageForOrgVariables } from '@dataconnect/read-guard-generated';

// The `ZonesPageForOrg` query requires an argument of type `ZonesPageForOrgVariables`:
const zonesPageForOrgVars: ZonesPageForOrgVariables = {
  orgId: ...,
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `zonesPageForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await zonesPageForOrg(zonesPageForOrgVars);
// Variables can be defined inline as well.
const { data } = await zonesPageForOrg({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await zonesPageForOrg(dataConnect, zonesPageForOrgVars);

console.log(data.zones);

// Or, you can use the `Promise` API.
zonesPageForOrg(zonesPageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.zones);
});
```

### Using `ZonesPageForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, zonesPageForOrgRef, ZonesPageForOrgVariables } from '@dataconnect/read-guard-generated';

// The `ZonesPageForOrg` query requires an argument of type `ZonesPageForOrgVariables`:
const zonesPageForOrgVars: ZonesPageForOrgVariables = {
  orgId: ...,
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `zonesPageForOrgRef()` function to get a reference to the query.
const ref = zonesPageForOrgRef(zonesPageForOrgVars);
// Variables can be defined inline as well.
const ref = zonesPageForOrgRef({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = zonesPageForOrgRef(dataConnect, zonesPageForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.zones);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.zones);
});
```

## BackupCyclesPageForOrg
You can execute the `BackupCyclesPageForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts):
```typescript
backupCyclesPageForOrg(vars: BackupCyclesPageForOrgVariables): QueryPromise<BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables>;

interface BackupCyclesPageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: BackupCyclesPageForOrgVariables): QueryRef<BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables>;
}
export const backupCyclesPageForOrgRef: BackupCyclesPageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
backupCyclesPageForOrg(dc: DataConnect, vars: BackupCyclesPageForOrgVariables): QueryPromise<BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables>;

interface BackupCyclesPageForOrgRef {
  ...
  (dc: DataConnect, vars: BackupCyclesPageForOrgVariables): QueryRef<BackupCyclesPageForOrgData, BackupCyclesPageForOrgVariables>;
}
export const backupCyclesPageForOrgRef: BackupCyclesPageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the backupCyclesPageForOrgRef:
```typescript
const name = backupCyclesPageForOrgRef.operationName;
console.log(name);
```

### Variables
The `BackupCyclesPageForOrg` query requires an argument of type `BackupCyclesPageForOrgVariables`, which is defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface BackupCyclesPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that executing the `BackupCyclesPageForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `BackupCyclesPageForOrgData`, which is defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `BackupCyclesPageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, backupCyclesPageForOrg, BackupCyclesPageForOrgVariables } from '@dataconnect/read-guard-generated';

// The `BackupCyclesPageForOrg` query requires an argument of type `BackupCyclesPageForOrgVariables`:
const backupCyclesPageForOrgVars: BackupCyclesPageForOrgVariables = {
  orgId: ...,
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `backupCyclesPageForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await backupCyclesPageForOrg(backupCyclesPageForOrgVars);
// Variables can be defined inline as well.
const { data } = await backupCyclesPageForOrg({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await backupCyclesPageForOrg(dataConnect, backupCyclesPageForOrgVars);

console.log(data.backupCycles);

// Or, you can use the `Promise` API.
backupCyclesPageForOrg(backupCyclesPageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.backupCycles);
});
```

### Using `BackupCyclesPageForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, backupCyclesPageForOrgRef, BackupCyclesPageForOrgVariables } from '@dataconnect/read-guard-generated';

// The `BackupCyclesPageForOrg` query requires an argument of type `BackupCyclesPageForOrgVariables`:
const backupCyclesPageForOrgVars: BackupCyclesPageForOrgVariables = {
  orgId: ...,
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `backupCyclesPageForOrgRef()` function to get a reference to the query.
const ref = backupCyclesPageForOrgRef(backupCyclesPageForOrgVars);
// Variables can be defined inline as well.
const ref = backupCyclesPageForOrgRef({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = backupCyclesPageForOrgRef(dataConnect, backupCyclesPageForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.backupCycles);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.backupCycles);
});
```

## WorkdayPausesPageForOrg
You can execute the `WorkdayPausesPageForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts):
```typescript
workdayPausesPageForOrg(vars: WorkdayPausesPageForOrgVariables): QueryPromise<WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables>;

interface WorkdayPausesPageForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdayPausesPageForOrgVariables): QueryRef<WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables>;
}
export const workdayPausesPageForOrgRef: WorkdayPausesPageForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
workdayPausesPageForOrg(dc: DataConnect, vars: WorkdayPausesPageForOrgVariables): QueryPromise<WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables>;

interface WorkdayPausesPageForOrgRef {
  ...
  (dc: DataConnect, vars: WorkdayPausesPageForOrgVariables): QueryRef<WorkdayPausesPageForOrgData, WorkdayPausesPageForOrgVariables>;
}
export const workdayPausesPageForOrgRef: WorkdayPausesPageForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the workdayPausesPageForOrgRef:
```typescript
const name = workdayPausesPageForOrgRef.operationName;
console.log(name);
```

### Variables
The `WorkdayPausesPageForOrg` query requires an argument of type `WorkdayPausesPageForOrgVariables`, which is defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface WorkdayPausesPageForOrgVariables {
  orgId: string;
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that executing the `WorkdayPausesPageForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `WorkdayPausesPageForOrgData`, which is defined in [dataconnect-read-guard-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `WorkdayPausesPageForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, workdayPausesPageForOrg, WorkdayPausesPageForOrgVariables } from '@dataconnect/read-guard-generated';

// The `WorkdayPausesPageForOrg` query requires an argument of type `WorkdayPausesPageForOrgVariables`:
const workdayPausesPageForOrgVars: WorkdayPausesPageForOrgVariables = {
  orgId: ...,
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `workdayPausesPageForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await workdayPausesPageForOrg(workdayPausesPageForOrgVars);
// Variables can be defined inline as well.
const { data } = await workdayPausesPageForOrg({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await workdayPausesPageForOrg(dataConnect, workdayPausesPageForOrgVars);

console.log(data.workdayPauses);

// Or, you can use the `Promise` API.
workdayPausesPageForOrg(workdayPausesPageForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workdayPauses);
});
```

### Using `WorkdayPausesPageForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, workdayPausesPageForOrgRef, WorkdayPausesPageForOrgVariables } from '@dataconnect/read-guard-generated';

// The `WorkdayPausesPageForOrg` query requires an argument of type `WorkdayPausesPageForOrgVariables`:
const workdayPausesPageForOrgVars: WorkdayPausesPageForOrgVariables = {
  orgId: ...,
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `workdayPausesPageForOrgRef()` function to get a reference to the query.
const ref = workdayPausesPageForOrgRef(workdayPausesPageForOrgVars);
// Variables can be defined inline as well.
const ref = workdayPausesPageForOrgRef({ orgId: ..., limit: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = workdayPausesPageForOrgRef(dataConnect, workdayPausesPageForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.workdayPauses);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.workdayPauses);
});
```

# Mutations

No mutations were generated for the `read-guard` connector.

If you want to learn more about how to use mutations in Data Connect, you can follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

