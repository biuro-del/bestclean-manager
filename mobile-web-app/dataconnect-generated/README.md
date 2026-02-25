# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*MyOrganizations*](#myorganizations)
  - [*WorkersForOrg*](#workersfororg)
  - [*ClientsForOrg*](#clientsfororg)
  - [*IndividualJobsForOrg*](#individualjobsfororg)
  - [*ZonesForOrg*](#zonesfororg)
  - [*WorkdaysForOrg*](#workdaysfororg)
  - [*BackupCyclesForOrg*](#backupcyclesfororg)
  - [*EventsForOrg*](#eventsfororg)
  - [*WorkerWorkdaysForOrg*](#workerworkdaysfororg)
- [**Mutations**](#mutations)
  - [*InsertWorkerForOrg*](#insertworkerfororg)
  - [*InsertClientForOrg*](#insertclientfororg)
  - [*UpdateClientForOrg*](#updateclientfororg)
  - [*DeleteClientForOrg*](#deleteclientfororg)
  - [*InsertIndividualJobForOrg*](#insertindividualjobfororg)
  - [*UpdateIndividualJobForOrg*](#updateindividualjobfororg)
  - [*DeleteIndividualJobForOrg*](#deleteindividualjobfororg)
  - [*InsertZoneForOrg*](#insertzonefororg)
  - [*UpdateZoneForOrg*](#updatezonefororg)
  - [*DeleteZoneForOrg*](#deletezonefororg)
  - [*InsertWorkdayForOrg*](#insertworkdayfororg)
  - [*UpdateWorkdayForOrg*](#updateworkdayfororg)
  - [*DeleteWorkdayForOrg*](#deleteworkdayfororg)
  - [*InsertEventForOrg*](#inserteventfororg)
  - [*UpdateEventForOrg*](#updateeventfororg)
  - [*DeleteEventForOrg*](#deleteeventfororg)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

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

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## MyOrganizations
You can execute the `MyOrganizations` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
myOrganizations(): QueryPromise<MyOrganizationsData, undefined>;

interface MyOrganizationsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyOrganizationsData, undefined>;
}
export const myOrganizationsRef: MyOrganizationsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
myOrganizations(dc: DataConnect): QueryPromise<MyOrganizationsData, undefined>;

interface MyOrganizationsRef {
  ...
  (dc: DataConnect): QueryRef<MyOrganizationsData, undefined>;
}
export const myOrganizationsRef: MyOrganizationsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the myOrganizationsRef:
```typescript
const name = myOrganizationsRef.operationName;
console.log(name);
```

### Variables
The `MyOrganizations` query has no variables.
### Return Type
Recall that executing the `MyOrganizations` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `MyOrganizationsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `MyOrganizations`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, myOrganizations } from '@dataconnect/generated';


// Call the `myOrganizations()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await myOrganizations();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await myOrganizations(dataConnect);

console.log(data.organizationMembers);

// Or, you can use the `Promise` API.
myOrganizations().then((response) => {
  const data = response.data;
  console.log(data.organizationMembers);
});
```

### Using `MyOrganizations`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, myOrganizationsRef } from '@dataconnect/generated';


// Call the `myOrganizationsRef()` function to get a reference to the query.
const ref = myOrganizationsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = myOrganizationsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.organizationMembers);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.organizationMembers);
});
```

## WorkersForOrg
You can execute the `WorkersForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
workersForOrg(vars: WorkersForOrgVariables): QueryPromise<WorkersForOrgData, WorkersForOrgVariables>;

interface WorkersForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkersForOrgVariables): QueryRef<WorkersForOrgData, WorkersForOrgVariables>;
}
export const workersForOrgRef: WorkersForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
workersForOrg(dc: DataConnect, vars: WorkersForOrgVariables): QueryPromise<WorkersForOrgData, WorkersForOrgVariables>;

interface WorkersForOrgRef {
  ...
  (dc: DataConnect, vars: WorkersForOrgVariables): QueryRef<WorkersForOrgData, WorkersForOrgVariables>;
}
export const workersForOrgRef: WorkersForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the workersForOrgRef:
```typescript
const name = workersForOrgRef.operationName;
console.log(name);
```

### Variables
The `WorkersForOrg` query requires an argument of type `WorkersForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface WorkersForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `WorkersForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `WorkersForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `WorkersForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, workersForOrg, WorkersForOrgVariables } from '@dataconnect/generated';

// The `WorkersForOrg` query requires an argument of type `WorkersForOrgVariables`:
const workersForOrgVars: WorkersForOrgVariables = {
  orgId: ..., 
};

// Call the `workersForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await workersForOrg(workersForOrgVars);
// Variables can be defined inline as well.
const { data } = await workersForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await workersForOrg(dataConnect, workersForOrgVars);

console.log(data.workers);

// Or, you can use the `Promise` API.
workersForOrg(workersForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workers);
});
```

### Using `WorkersForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, workersForOrgRef, WorkersForOrgVariables } from '@dataconnect/generated';

// The `WorkersForOrg` query requires an argument of type `WorkersForOrgVariables`:
const workersForOrgVars: WorkersForOrgVariables = {
  orgId: ..., 
};

// Call the `workersForOrgRef()` function to get a reference to the query.
const ref = workersForOrgRef(workersForOrgVars);
// Variables can be defined inline as well.
const ref = workersForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = workersForOrgRef(dataConnect, workersForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.workers);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.workers);
});
```

## ClientsForOrg
You can execute the `ClientsForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
clientsForOrg(vars: ClientsForOrgVariables): QueryPromise<ClientsForOrgData, ClientsForOrgVariables>;

interface ClientsForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ClientsForOrgVariables): QueryRef<ClientsForOrgData, ClientsForOrgVariables>;
}
export const clientsForOrgRef: ClientsForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
clientsForOrg(dc: DataConnect, vars: ClientsForOrgVariables): QueryPromise<ClientsForOrgData, ClientsForOrgVariables>;

interface ClientsForOrgRef {
  ...
  (dc: DataConnect, vars: ClientsForOrgVariables): QueryRef<ClientsForOrgData, ClientsForOrgVariables>;
}
export const clientsForOrgRef: ClientsForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the clientsForOrgRef:
```typescript
const name = clientsForOrgRef.operationName;
console.log(name);
```

### Variables
The `ClientsForOrg` query requires an argument of type `ClientsForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ClientsForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `ClientsForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ClientsForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `ClientsForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, clientsForOrg, ClientsForOrgVariables } from '@dataconnect/generated';

// The `ClientsForOrg` query requires an argument of type `ClientsForOrgVariables`:
const clientsForOrgVars: ClientsForOrgVariables = {
  orgId: ..., 
};

// Call the `clientsForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await clientsForOrg(clientsForOrgVars);
// Variables can be defined inline as well.
const { data } = await clientsForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await clientsForOrg(dataConnect, clientsForOrgVars);

console.log(data.clients);

// Or, you can use the `Promise` API.
clientsForOrg(clientsForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.clients);
});
```

### Using `ClientsForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, clientsForOrgRef, ClientsForOrgVariables } from '@dataconnect/generated';

// The `ClientsForOrg` query requires an argument of type `ClientsForOrgVariables`:
const clientsForOrgVars: ClientsForOrgVariables = {
  orgId: ..., 
};

// Call the `clientsForOrgRef()` function to get a reference to the query.
const ref = clientsForOrgRef(clientsForOrgVars);
// Variables can be defined inline as well.
const ref = clientsForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = clientsForOrgRef(dataConnect, clientsForOrgVars);

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

## IndividualJobsForOrg
You can execute the `IndividualJobsForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
individualJobsForOrg(vars: IndividualJobsForOrgVariables): QueryPromise<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;

interface IndividualJobsForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: IndividualJobsForOrgVariables): QueryRef<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;
}
export const individualJobsForOrgRef: IndividualJobsForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
individualJobsForOrg(dc: DataConnect, vars: IndividualJobsForOrgVariables): QueryPromise<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;

interface IndividualJobsForOrgRef {
  ...
  (dc: DataConnect, vars: IndividualJobsForOrgVariables): QueryRef<IndividualJobsForOrgData, IndividualJobsForOrgVariables>;
}
export const individualJobsForOrgRef: IndividualJobsForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the individualJobsForOrgRef:
```typescript
const name = individualJobsForOrgRef.operationName;
console.log(name);
```

### Variables
The `IndividualJobsForOrg` query requires an argument of type `IndividualJobsForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface IndividualJobsForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `IndividualJobsForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `IndividualJobsForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `IndividualJobsForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, individualJobsForOrg, IndividualJobsForOrgVariables } from '@dataconnect/generated';

// The `IndividualJobsForOrg` query requires an argument of type `IndividualJobsForOrgVariables`:
const individualJobsForOrgVars: IndividualJobsForOrgVariables = {
  orgId: ..., 
};

// Call the `individualJobsForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await individualJobsForOrg(individualJobsForOrgVars);
// Variables can be defined inline as well.
const { data } = await individualJobsForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await individualJobsForOrg(dataConnect, individualJobsForOrgVars);

console.log(data.individualClientJobs);

// Or, you can use the `Promise` API.
individualJobsForOrg(individualJobsForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.individualClientJobs);
});
```

### Using `IndividualJobsForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, individualJobsForOrgRef, IndividualJobsForOrgVariables } from '@dataconnect/generated';

// The `IndividualJobsForOrg` query requires an argument of type `IndividualJobsForOrgVariables`:
const individualJobsForOrgVars: IndividualJobsForOrgVariables = {
  orgId: ..., 
};

// Call the `individualJobsForOrgRef()` function to get a reference to the query.
const ref = individualJobsForOrgRef(individualJobsForOrgVars);
// Variables can be defined inline as well.
const ref = individualJobsForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = individualJobsForOrgRef(dataConnect, individualJobsForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.individualClientJobs);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.individualClientJobs);
});
```

## ZonesForOrg
You can execute the `ZonesForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
zonesForOrg(vars: ZonesForOrgVariables): QueryPromise<ZonesForOrgData, ZonesForOrgVariables>;

interface ZonesForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ZonesForOrgVariables): QueryRef<ZonesForOrgData, ZonesForOrgVariables>;
}
export const zonesForOrgRef: ZonesForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
zonesForOrg(dc: DataConnect, vars: ZonesForOrgVariables): QueryPromise<ZonesForOrgData, ZonesForOrgVariables>;

interface ZonesForOrgRef {
  ...
  (dc: DataConnect, vars: ZonesForOrgVariables): QueryRef<ZonesForOrgData, ZonesForOrgVariables>;
}
export const zonesForOrgRef: ZonesForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the zonesForOrgRef:
```typescript
const name = zonesForOrgRef.operationName;
console.log(name);
```

### Variables
The `ZonesForOrg` query requires an argument of type `ZonesForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ZonesForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `ZonesForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ZonesForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `ZonesForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, zonesForOrg, ZonesForOrgVariables } from '@dataconnect/generated';

// The `ZonesForOrg` query requires an argument of type `ZonesForOrgVariables`:
const zonesForOrgVars: ZonesForOrgVariables = {
  orgId: ..., 
};

// Call the `zonesForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await zonesForOrg(zonesForOrgVars);
// Variables can be defined inline as well.
const { data } = await zonesForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await zonesForOrg(dataConnect, zonesForOrgVars);

console.log(data.zones);

// Or, you can use the `Promise` API.
zonesForOrg(zonesForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.zones);
});
```

### Using `ZonesForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, zonesForOrgRef, ZonesForOrgVariables } from '@dataconnect/generated';

// The `ZonesForOrg` query requires an argument of type `ZonesForOrgVariables`:
const zonesForOrgVars: ZonesForOrgVariables = {
  orgId: ..., 
};

// Call the `zonesForOrgRef()` function to get a reference to the query.
const ref = zonesForOrgRef(zonesForOrgVars);
// Variables can be defined inline as well.
const ref = zonesForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = zonesForOrgRef(dataConnect, zonesForOrgVars);

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

## WorkdaysForOrg
You can execute the `WorkdaysForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
workdaysForOrg(vars: WorkdaysForOrgVariables): QueryPromise<WorkdaysForOrgData, WorkdaysForOrgVariables>;

interface WorkdaysForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkdaysForOrgVariables): QueryRef<WorkdaysForOrgData, WorkdaysForOrgVariables>;
}
export const workdaysForOrgRef: WorkdaysForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
workdaysForOrg(dc: DataConnect, vars: WorkdaysForOrgVariables): QueryPromise<WorkdaysForOrgData, WorkdaysForOrgVariables>;

interface WorkdaysForOrgRef {
  ...
  (dc: DataConnect, vars: WorkdaysForOrgVariables): QueryRef<WorkdaysForOrgData, WorkdaysForOrgVariables>;
}
export const workdaysForOrgRef: WorkdaysForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the workdaysForOrgRef:
```typescript
const name = workdaysForOrgRef.operationName;
console.log(name);
```

### Variables
The `WorkdaysForOrg` query requires an argument of type `WorkdaysForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface WorkdaysForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `WorkdaysForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `WorkdaysForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `WorkdaysForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, workdaysForOrg, WorkdaysForOrgVariables } from '@dataconnect/generated';

// The `WorkdaysForOrg` query requires an argument of type `WorkdaysForOrgVariables`:
const workdaysForOrgVars: WorkdaysForOrgVariables = {
  orgId: ..., 
};

// Call the `workdaysForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await workdaysForOrg(workdaysForOrgVars);
// Variables can be defined inline as well.
const { data } = await workdaysForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await workdaysForOrg(dataConnect, workdaysForOrgVars);

console.log(data.workdays);

// Or, you can use the `Promise` API.
workdaysForOrg(workdaysForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workdays);
});
```

### Using `WorkdaysForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, workdaysForOrgRef, WorkdaysForOrgVariables } from '@dataconnect/generated';

// The `WorkdaysForOrg` query requires an argument of type `WorkdaysForOrgVariables`:
const workdaysForOrgVars: WorkdaysForOrgVariables = {
  orgId: ..., 
};

// Call the `workdaysForOrgRef()` function to get a reference to the query.
const ref = workdaysForOrgRef(workdaysForOrgVars);
// Variables can be defined inline as well.
const ref = workdaysForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = workdaysForOrgRef(dataConnect, workdaysForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.workdays);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.workdays);
});
```

## BackupCyclesForOrg
You can execute the `BackupCyclesForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
backupCyclesForOrg(vars: BackupCyclesForOrgVariables): QueryPromise<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;

interface BackupCyclesForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: BackupCyclesForOrgVariables): QueryRef<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;
}
export const backupCyclesForOrgRef: BackupCyclesForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
backupCyclesForOrg(dc: DataConnect, vars: BackupCyclesForOrgVariables): QueryPromise<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;

interface BackupCyclesForOrgRef {
  ...
  (dc: DataConnect, vars: BackupCyclesForOrgVariables): QueryRef<BackupCyclesForOrgData, BackupCyclesForOrgVariables>;
}
export const backupCyclesForOrgRef: BackupCyclesForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the backupCyclesForOrgRef:
```typescript
const name = backupCyclesForOrgRef.operationName;
console.log(name);
```

### Variables
The `BackupCyclesForOrg` query requires an argument of type `BackupCyclesForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface BackupCyclesForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `BackupCyclesForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `BackupCyclesForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `BackupCyclesForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, backupCyclesForOrg, BackupCyclesForOrgVariables } from '@dataconnect/generated';

// The `BackupCyclesForOrg` query requires an argument of type `BackupCyclesForOrgVariables`:
const backupCyclesForOrgVars: BackupCyclesForOrgVariables = {
  orgId: ..., 
};

// Call the `backupCyclesForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await backupCyclesForOrg(backupCyclesForOrgVars);
// Variables can be defined inline as well.
const { data } = await backupCyclesForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await backupCyclesForOrg(dataConnect, backupCyclesForOrgVars);

console.log(data.backupCycles);

// Or, you can use the `Promise` API.
backupCyclesForOrg(backupCyclesForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.backupCycles);
});
```

### Using `BackupCyclesForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, backupCyclesForOrgRef, BackupCyclesForOrgVariables } from '@dataconnect/generated';

// The `BackupCyclesForOrg` query requires an argument of type `BackupCyclesForOrgVariables`:
const backupCyclesForOrgVars: BackupCyclesForOrgVariables = {
  orgId: ..., 
};

// Call the `backupCyclesForOrgRef()` function to get a reference to the query.
const ref = backupCyclesForOrgRef(backupCyclesForOrgVars);
// Variables can be defined inline as well.
const ref = backupCyclesForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = backupCyclesForOrgRef(dataConnect, backupCyclesForOrgVars);

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

## EventsForOrg
You can execute the `EventsForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
eventsForOrg(vars: EventsForOrgVariables): QueryPromise<EventsForOrgData, EventsForOrgVariables>;

interface EventsForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: EventsForOrgVariables): QueryRef<EventsForOrgData, EventsForOrgVariables>;
}
export const eventsForOrgRef: EventsForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
eventsForOrg(dc: DataConnect, vars: EventsForOrgVariables): QueryPromise<EventsForOrgData, EventsForOrgVariables>;

interface EventsForOrgRef {
  ...
  (dc: DataConnect, vars: EventsForOrgVariables): QueryRef<EventsForOrgData, EventsForOrgVariables>;
}
export const eventsForOrgRef: EventsForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the eventsForOrgRef:
```typescript
const name = eventsForOrgRef.operationName;
console.log(name);
```

### Variables
The `EventsForOrg` query requires an argument of type `EventsForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface EventsForOrgVariables {
  orgId: string;
}
```
### Return Type
Recall that executing the `EventsForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `EventsForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `EventsForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, eventsForOrg, EventsForOrgVariables } from '@dataconnect/generated';

// The `EventsForOrg` query requires an argument of type `EventsForOrgVariables`:
const eventsForOrgVars: EventsForOrgVariables = {
  orgId: ..., 
};

// Call the `eventsForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await eventsForOrg(eventsForOrgVars);
// Variables can be defined inline as well.
const { data } = await eventsForOrg({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await eventsForOrg(dataConnect, eventsForOrgVars);

console.log(data.events);

// Or, you can use the `Promise` API.
eventsForOrg(eventsForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.events);
});
```

### Using `EventsForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, eventsForOrgRef, EventsForOrgVariables } from '@dataconnect/generated';

// The `EventsForOrg` query requires an argument of type `EventsForOrgVariables`:
const eventsForOrgVars: EventsForOrgVariables = {
  orgId: ..., 
};

// Call the `eventsForOrgRef()` function to get a reference to the query.
const ref = eventsForOrgRef(eventsForOrgVars);
// Variables can be defined inline as well.
const ref = eventsForOrgRef({ orgId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = eventsForOrgRef(dataConnect, eventsForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.events);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.events);
});
```

## WorkerWorkdaysForOrg
You can execute the `WorkerWorkdaysForOrg` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
workerWorkdaysForOrg(vars: WorkerWorkdaysForOrgVariables): QueryPromise<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;

interface WorkerWorkdaysForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: WorkerWorkdaysForOrgVariables): QueryRef<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;
}
export const workerWorkdaysForOrgRef: WorkerWorkdaysForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
workerWorkdaysForOrg(dc: DataConnect, vars: WorkerWorkdaysForOrgVariables): QueryPromise<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;

interface WorkerWorkdaysForOrgRef {
  ...
  (dc: DataConnect, vars: WorkerWorkdaysForOrgVariables): QueryRef<WorkerWorkdaysForOrgData, WorkerWorkdaysForOrgVariables>;
}
export const workerWorkdaysForOrgRef: WorkerWorkdaysForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the workerWorkdaysForOrgRef:
```typescript
const name = workerWorkdaysForOrgRef.operationName;
console.log(name);
```

### Variables
The `WorkerWorkdaysForOrg` query requires an argument of type `WorkerWorkdaysForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface WorkerWorkdaysForOrgVariables {
  orgId: string;
  workerLogin: string;
}
```
### Return Type
Recall that executing the `WorkerWorkdaysForOrg` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `WorkerWorkdaysForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `WorkerWorkdaysForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, workerWorkdaysForOrg, WorkerWorkdaysForOrgVariables } from '@dataconnect/generated';

// The `WorkerWorkdaysForOrg` query requires an argument of type `WorkerWorkdaysForOrgVariables`:
const workerWorkdaysForOrgVars: WorkerWorkdaysForOrgVariables = {
  orgId: ..., 
  workerLogin: ..., 
};

// Call the `workerWorkdaysForOrg()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await workerWorkdaysForOrg(workerWorkdaysForOrgVars);
// Variables can be defined inline as well.
const { data } = await workerWorkdaysForOrg({ orgId: ..., workerLogin: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await workerWorkdaysForOrg(dataConnect, workerWorkdaysForOrgVars);

console.log(data.workdays);

// Or, you can use the `Promise` API.
workerWorkdaysForOrg(workerWorkdaysForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workdays);
});
```

### Using `WorkerWorkdaysForOrg`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, workerWorkdaysForOrgRef, WorkerWorkdaysForOrgVariables } from '@dataconnect/generated';

// The `WorkerWorkdaysForOrg` query requires an argument of type `WorkerWorkdaysForOrgVariables`:
const workerWorkdaysForOrgVars: WorkerWorkdaysForOrgVariables = {
  orgId: ..., 
  workerLogin: ..., 
};

// Call the `workerWorkdaysForOrgRef()` function to get a reference to the query.
const ref = workerWorkdaysForOrgRef(workerWorkdaysForOrgVars);
// Variables can be defined inline as well.
const ref = workerWorkdaysForOrgRef({ orgId: ..., workerLogin: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = workerWorkdaysForOrgRef(dataConnect, workerWorkdaysForOrgVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.workdays);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.workdays);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## InsertWorkerForOrg
You can execute the `InsertWorkerForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertWorkerForOrg(vars: InsertWorkerForOrgVariables): MutationPromise<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;

interface InsertWorkerForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertWorkerForOrgVariables): MutationRef<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;
}
export const insertWorkerForOrgRef: InsertWorkerForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertWorkerForOrg(dc: DataConnect, vars: InsertWorkerForOrgVariables): MutationPromise<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;

interface InsertWorkerForOrgRef {
  ...
  (dc: DataConnect, vars: InsertWorkerForOrgVariables): MutationRef<InsertWorkerForOrgData, InsertWorkerForOrgVariables>;
}
export const insertWorkerForOrgRef: InsertWorkerForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertWorkerForOrgRef:
```typescript
const name = insertWorkerForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertWorkerForOrg` mutation requires an argument of type `InsertWorkerForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
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
```
### Return Type
Recall that executing the `InsertWorkerForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertWorkerForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertWorkerForOrgData {
  worker_insert: Worker_Key;
}
```
### Using `InsertWorkerForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertWorkerForOrg, InsertWorkerForOrgVariables } from '@dataconnect/generated';

// The `InsertWorkerForOrg` mutation requires an argument of type `InsertWorkerForOrgVariables`:
const insertWorkerForOrgVars: InsertWorkerForOrgVariables = {
  orgId: ..., 
  login: ..., 
  fullName: ..., // optional
  loginEmail: ..., // optional
  role: ..., // optional
  active: ..., // optional
  email: ..., // optional
  phone: ..., // optional
  workerType: ..., // optional
  workerId: ..., // optional
};

// Call the `insertWorkerForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertWorkerForOrg(insertWorkerForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertWorkerForOrg({ orgId: ..., login: ..., fullName: ..., loginEmail: ..., role: ..., active: ..., email: ..., phone: ..., workerType: ..., workerId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertWorkerForOrg(dataConnect, insertWorkerForOrgVars);

console.log(data.worker_insert);

// Or, you can use the `Promise` API.
insertWorkerForOrg(insertWorkerForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.worker_insert);
});
```

### Using `InsertWorkerForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertWorkerForOrgRef, InsertWorkerForOrgVariables } from '@dataconnect/generated';

// The `InsertWorkerForOrg` mutation requires an argument of type `InsertWorkerForOrgVariables`:
const insertWorkerForOrgVars: InsertWorkerForOrgVariables = {
  orgId: ..., 
  login: ..., 
  fullName: ..., // optional
  loginEmail: ..., // optional
  role: ..., // optional
  active: ..., // optional
  email: ..., // optional
  phone: ..., // optional
  workerType: ..., // optional
  workerId: ..., // optional
};

// Call the `insertWorkerForOrgRef()` function to get a reference to the mutation.
const ref = insertWorkerForOrgRef(insertWorkerForOrgVars);
// Variables can be defined inline as well.
const ref = insertWorkerForOrgRef({ orgId: ..., login: ..., fullName: ..., loginEmail: ..., role: ..., active: ..., email: ..., phone: ..., workerType: ..., workerId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertWorkerForOrgRef(dataConnect, insertWorkerForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.worker_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.worker_insert);
});
```

## InsertClientForOrg
You can execute the `InsertClientForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertClientForOrg(vars: InsertClientForOrgVariables): MutationPromise<InsertClientForOrgData, InsertClientForOrgVariables>;

interface InsertClientForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertClientForOrgVariables): MutationRef<InsertClientForOrgData, InsertClientForOrgVariables>;
}
export const insertClientForOrgRef: InsertClientForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertClientForOrg(dc: DataConnect, vars: InsertClientForOrgVariables): MutationPromise<InsertClientForOrgData, InsertClientForOrgVariables>;

interface InsertClientForOrgRef {
  ...
  (dc: DataConnect, vars: InsertClientForOrgVariables): MutationRef<InsertClientForOrgData, InsertClientForOrgVariables>;
}
export const insertClientForOrgRef: InsertClientForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertClientForOrgRef:
```typescript
const name = insertClientForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertClientForOrg` mutation requires an argument of type `InsertClientForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
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
```
### Return Type
Recall that executing the `InsertClientForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertClientForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertClientForOrgData {
  client_insert: Client_Key;
}
```
### Using `InsertClientForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertClientForOrg, InsertClientForOrgVariables } from '@dataconnect/generated';

// The `InsertClientForOrg` mutation requires an argument of type `InsertClientForOrgVariables`:
const insertClientForOrgVars: InsertClientForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  name: ..., // optional
  nip: ..., // optional
  city: ..., // optional
  address: ..., // optional
  contact: ..., // optional
  status: ..., // optional
  coordinator: ..., // optional
  serviceFrequency: ..., // optional
  assignees: ..., // optional
  chemistry: ..., // optional
  equipment: ..., // optional
  clientInfo: ..., // optional
};

// Call the `insertClientForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertClientForOrg(insertClientForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertClientForOrg({ orgId: ..., clientId: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., status: ..., coordinator: ..., serviceFrequency: ..., assignees: ..., chemistry: ..., equipment: ..., clientInfo: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertClientForOrg(dataConnect, insertClientForOrgVars);

console.log(data.client_insert);

// Or, you can use the `Promise` API.
insertClientForOrg(insertClientForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.client_insert);
});
```

### Using `InsertClientForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertClientForOrgRef, InsertClientForOrgVariables } from '@dataconnect/generated';

// The `InsertClientForOrg` mutation requires an argument of type `InsertClientForOrgVariables`:
const insertClientForOrgVars: InsertClientForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  name: ..., // optional
  nip: ..., // optional
  city: ..., // optional
  address: ..., // optional
  contact: ..., // optional
  status: ..., // optional
  coordinator: ..., // optional
  serviceFrequency: ..., // optional
  assignees: ..., // optional
  chemistry: ..., // optional
  equipment: ..., // optional
  clientInfo: ..., // optional
};

// Call the `insertClientForOrgRef()` function to get a reference to the mutation.
const ref = insertClientForOrgRef(insertClientForOrgVars);
// Variables can be defined inline as well.
const ref = insertClientForOrgRef({ orgId: ..., clientId: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., status: ..., coordinator: ..., serviceFrequency: ..., assignees: ..., chemistry: ..., equipment: ..., clientInfo: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertClientForOrgRef(dataConnect, insertClientForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.client_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.client_insert);
});
```

## UpdateClientForOrg
You can execute the `UpdateClientForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateClientForOrg(vars: UpdateClientForOrgVariables): MutationPromise<UpdateClientForOrgData, UpdateClientForOrgVariables>;

interface UpdateClientForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateClientForOrgVariables): MutationRef<UpdateClientForOrgData, UpdateClientForOrgVariables>;
}
export const updateClientForOrgRef: UpdateClientForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateClientForOrg(dc: DataConnect, vars: UpdateClientForOrgVariables): MutationPromise<UpdateClientForOrgData, UpdateClientForOrgVariables>;

interface UpdateClientForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateClientForOrgVariables): MutationRef<UpdateClientForOrgData, UpdateClientForOrgVariables>;
}
export const updateClientForOrgRef: UpdateClientForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateClientForOrgRef:
```typescript
const name = updateClientForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateClientForOrg` mutation requires an argument of type `UpdateClientForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
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
```
### Return Type
Recall that executing the `UpdateClientForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateClientForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateClientForOrgData {
  client_update?: Client_Key | null;
}
```
### Using `UpdateClientForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateClientForOrg, UpdateClientForOrgVariables } from '@dataconnect/generated';

// The `UpdateClientForOrg` mutation requires an argument of type `UpdateClientForOrgVariables`:
const updateClientForOrgVars: UpdateClientForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  name: ..., // optional
  nip: ..., // optional
  city: ..., // optional
  address: ..., // optional
  contact: ..., // optional
  status: ..., // optional
  coordinator: ..., // optional
  serviceFrequency: ..., // optional
  assignees: ..., // optional
  chemistry: ..., // optional
  equipment: ..., // optional
  clientInfo: ..., // optional
};

// Call the `updateClientForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateClientForOrg(updateClientForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateClientForOrg({ orgId: ..., clientId: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., status: ..., coordinator: ..., serviceFrequency: ..., assignees: ..., chemistry: ..., equipment: ..., clientInfo: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateClientForOrg(dataConnect, updateClientForOrgVars);

console.log(data.client_update);

// Or, you can use the `Promise` API.
updateClientForOrg(updateClientForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.client_update);
});
```

### Using `UpdateClientForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateClientForOrgRef, UpdateClientForOrgVariables } from '@dataconnect/generated';

// The `UpdateClientForOrg` mutation requires an argument of type `UpdateClientForOrgVariables`:
const updateClientForOrgVars: UpdateClientForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
  name: ..., // optional
  nip: ..., // optional
  city: ..., // optional
  address: ..., // optional
  contact: ..., // optional
  status: ..., // optional
  coordinator: ..., // optional
  serviceFrequency: ..., // optional
  assignees: ..., // optional
  chemistry: ..., // optional
  equipment: ..., // optional
  clientInfo: ..., // optional
};

// Call the `updateClientForOrgRef()` function to get a reference to the mutation.
const ref = updateClientForOrgRef(updateClientForOrgVars);
// Variables can be defined inline as well.
const ref = updateClientForOrgRef({ orgId: ..., clientId: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., status: ..., coordinator: ..., serviceFrequency: ..., assignees: ..., chemistry: ..., equipment: ..., clientInfo: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateClientForOrgRef(dataConnect, updateClientForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.client_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.client_update);
});
```

## DeleteClientForOrg
You can execute the `DeleteClientForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteClientForOrg(vars: DeleteClientForOrgVariables): MutationPromise<DeleteClientForOrgData, DeleteClientForOrgVariables>;

interface DeleteClientForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteClientForOrgVariables): MutationRef<DeleteClientForOrgData, DeleteClientForOrgVariables>;
}
export const deleteClientForOrgRef: DeleteClientForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteClientForOrg(dc: DataConnect, vars: DeleteClientForOrgVariables): MutationPromise<DeleteClientForOrgData, DeleteClientForOrgVariables>;

interface DeleteClientForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteClientForOrgVariables): MutationRef<DeleteClientForOrgData, DeleteClientForOrgVariables>;
}
export const deleteClientForOrgRef: DeleteClientForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteClientForOrgRef:
```typescript
const name = deleteClientForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteClientForOrg` mutation requires an argument of type `DeleteClientForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteClientForOrgVariables {
  orgId: string;
  clientId: string;
}
```
### Return Type
Recall that executing the `DeleteClientForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteClientForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteClientForOrgData {
  client_delete?: Client_Key | null;
}
```
### Using `DeleteClientForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteClientForOrg, DeleteClientForOrgVariables } from '@dataconnect/generated';

// The `DeleteClientForOrg` mutation requires an argument of type `DeleteClientForOrgVariables`:
const deleteClientForOrgVars: DeleteClientForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
};

// Call the `deleteClientForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteClientForOrg(deleteClientForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteClientForOrg({ orgId: ..., clientId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteClientForOrg(dataConnect, deleteClientForOrgVars);

console.log(data.client_delete);

// Or, you can use the `Promise` API.
deleteClientForOrg(deleteClientForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.client_delete);
});
```

### Using `DeleteClientForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteClientForOrgRef, DeleteClientForOrgVariables } from '@dataconnect/generated';

// The `DeleteClientForOrg` mutation requires an argument of type `DeleteClientForOrgVariables`:
const deleteClientForOrgVars: DeleteClientForOrgVariables = {
  orgId: ..., 
  clientId: ..., 
};

// Call the `deleteClientForOrgRef()` function to get a reference to the mutation.
const ref = deleteClientForOrgRef(deleteClientForOrgVars);
// Variables can be defined inline as well.
const ref = deleteClientForOrgRef({ orgId: ..., clientId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteClientForOrgRef(dataConnect, deleteClientForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.client_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.client_delete);
});
```

## InsertIndividualJobForOrg
You can execute the `InsertIndividualJobForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertIndividualJobForOrg(vars: InsertIndividualJobForOrgVariables): MutationPromise<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;

interface InsertIndividualJobForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertIndividualJobForOrgVariables): MutationRef<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;
}
export const insertIndividualJobForOrgRef: InsertIndividualJobForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertIndividualJobForOrg(dc: DataConnect, vars: InsertIndividualJobForOrgVariables): MutationPromise<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;

interface InsertIndividualJobForOrgRef {
  ...
  (dc: DataConnect, vars: InsertIndividualJobForOrgVariables): MutationRef<InsertIndividualJobForOrgData, InsertIndividualJobForOrgVariables>;
}
export const insertIndividualJobForOrgRef: InsertIndividualJobForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertIndividualJobForOrgRef:
```typescript
const name = insertIndividualJobForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertIndividualJobForOrg` mutation requires an argument of type `InsertIndividualJobForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
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
Recall that executing the `InsertIndividualJobForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertIndividualJobForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertIndividualJobForOrgData {
  individualClientJob_insert: IndividualClientJob_Key;
}
```
### Using `InsertIndividualJobForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertIndividualJobForOrg, InsertIndividualJobForOrgVariables } from '@dataconnect/generated';

// The `InsertIndividualJobForOrg` mutation requires an argument of type `InsertIndividualJobForOrgVariables`:
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

// Call the `insertIndividualJobForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertIndividualJobForOrg(insertIndividualJobForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertIndividualJobForOrg({ orgId: ..., clientIndId: ..., date: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., clientInfo: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertIndividualJobForOrg(dataConnect, insertIndividualJobForOrgVars);

console.log(data.individualClientJob_insert);

// Or, you can use the `Promise` API.
insertIndividualJobForOrg(insertIndividualJobForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.individualClientJob_insert);
});
```

### Using `InsertIndividualJobForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertIndividualJobForOrgRef, InsertIndividualJobForOrgVariables } from '@dataconnect/generated';

// The `InsertIndividualJobForOrg` mutation requires an argument of type `InsertIndividualJobForOrgVariables`:
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

// Call the `insertIndividualJobForOrgRef()` function to get a reference to the mutation.
const ref = insertIndividualJobForOrgRef(insertIndividualJobForOrgVars);
// Variables can be defined inline as well.
const ref = insertIndividualJobForOrgRef({ orgId: ..., clientIndId: ..., date: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., clientInfo: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertIndividualJobForOrgRef(dataConnect, insertIndividualJobForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.individualClientJob_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.individualClientJob_insert);
});
```

## UpdateIndividualJobForOrg
You can execute the `UpdateIndividualJobForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateIndividualJobForOrg(vars: UpdateIndividualJobForOrgVariables): MutationPromise<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;

interface UpdateIndividualJobForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateIndividualJobForOrgVariables): MutationRef<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;
}
export const updateIndividualJobForOrgRef: UpdateIndividualJobForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateIndividualJobForOrg(dc: DataConnect, vars: UpdateIndividualJobForOrgVariables): MutationPromise<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;

interface UpdateIndividualJobForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateIndividualJobForOrgVariables): MutationRef<UpdateIndividualJobForOrgData, UpdateIndividualJobForOrgVariables>;
}
export const updateIndividualJobForOrgRef: UpdateIndividualJobForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateIndividualJobForOrgRef:
```typescript
const name = updateIndividualJobForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateIndividualJobForOrg` mutation requires an argument of type `UpdateIndividualJobForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
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
Recall that executing the `UpdateIndividualJobForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateIndividualJobForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateIndividualJobForOrgData {
  individualClientJob_update?: IndividualClientJob_Key | null;
}
```
### Using `UpdateIndividualJobForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateIndividualJobForOrg, UpdateIndividualJobForOrgVariables } from '@dataconnect/generated';

// The `UpdateIndividualJobForOrg` mutation requires an argument of type `UpdateIndividualJobForOrgVariables`:
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

// Call the `updateIndividualJobForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateIndividualJobForOrg(updateIndividualJobForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateIndividualJobForOrg({ orgId: ..., clientIndId: ..., date: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., clientInfo: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateIndividualJobForOrg(dataConnect, updateIndividualJobForOrgVars);

console.log(data.individualClientJob_update);

// Or, you can use the `Promise` API.
updateIndividualJobForOrg(updateIndividualJobForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.individualClientJob_update);
});
```

### Using `UpdateIndividualJobForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateIndividualJobForOrgRef, UpdateIndividualJobForOrgVariables } from '@dataconnect/generated';

// The `UpdateIndividualJobForOrg` mutation requires an argument of type `UpdateIndividualJobForOrgVariables`:
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

// Call the `updateIndividualJobForOrgRef()` function to get a reference to the mutation.
const ref = updateIndividualJobForOrgRef(updateIndividualJobForOrgVars);
// Variables can be defined inline as well.
const ref = updateIndividualJobForOrgRef({ orgId: ..., clientIndId: ..., date: ..., name: ..., nip: ..., city: ..., address: ..., contact: ..., clientInfo: ..., qrCode: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateIndividualJobForOrgRef(dataConnect, updateIndividualJobForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.individualClientJob_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.individualClientJob_update);
});
```

## DeleteIndividualJobForOrg
You can execute the `DeleteIndividualJobForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteIndividualJobForOrg(vars: DeleteIndividualJobForOrgVariables): MutationPromise<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;

interface DeleteIndividualJobForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteIndividualJobForOrgVariables): MutationRef<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;
}
export const deleteIndividualJobForOrgRef: DeleteIndividualJobForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteIndividualJobForOrg(dc: DataConnect, vars: DeleteIndividualJobForOrgVariables): MutationPromise<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;

interface DeleteIndividualJobForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteIndividualJobForOrgVariables): MutationRef<DeleteIndividualJobForOrgData, DeleteIndividualJobForOrgVariables>;
}
export const deleteIndividualJobForOrgRef: DeleteIndividualJobForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteIndividualJobForOrgRef:
```typescript
const name = deleteIndividualJobForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteIndividualJobForOrg` mutation requires an argument of type `DeleteIndividualJobForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteIndividualJobForOrgVariables {
  orgId: string;
  clientIndId: string;
}
```
### Return Type
Recall that executing the `DeleteIndividualJobForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteIndividualJobForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteIndividualJobForOrgData {
  individualClientJob_delete?: IndividualClientJob_Key | null;
}
```
### Using `DeleteIndividualJobForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteIndividualJobForOrg, DeleteIndividualJobForOrgVariables } from '@dataconnect/generated';

// The `DeleteIndividualJobForOrg` mutation requires an argument of type `DeleteIndividualJobForOrgVariables`:
const deleteIndividualJobForOrgVars: DeleteIndividualJobForOrgVariables = {
  orgId: ..., 
  clientIndId: ..., 
};

// Call the `deleteIndividualJobForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteIndividualJobForOrg(deleteIndividualJobForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteIndividualJobForOrg({ orgId: ..., clientIndId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteIndividualJobForOrg(dataConnect, deleteIndividualJobForOrgVars);

console.log(data.individualClientJob_delete);

// Or, you can use the `Promise` API.
deleteIndividualJobForOrg(deleteIndividualJobForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.individualClientJob_delete);
});
```

### Using `DeleteIndividualJobForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteIndividualJobForOrgRef, DeleteIndividualJobForOrgVariables } from '@dataconnect/generated';

// The `DeleteIndividualJobForOrg` mutation requires an argument of type `DeleteIndividualJobForOrgVariables`:
const deleteIndividualJobForOrgVars: DeleteIndividualJobForOrgVariables = {
  orgId: ..., 
  clientIndId: ..., 
};

// Call the `deleteIndividualJobForOrgRef()` function to get a reference to the mutation.
const ref = deleteIndividualJobForOrgRef(deleteIndividualJobForOrgVars);
// Variables can be defined inline as well.
const ref = deleteIndividualJobForOrgRef({ orgId: ..., clientIndId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteIndividualJobForOrgRef(dataConnect, deleteIndividualJobForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.individualClientJob_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.individualClientJob_delete);
});
```

## InsertZoneForOrg
You can execute the `InsertZoneForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertZoneForOrg(vars: InsertZoneForOrgVariables): MutationPromise<InsertZoneForOrgData, InsertZoneForOrgVariables>;

interface InsertZoneForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertZoneForOrgVariables): MutationRef<InsertZoneForOrgData, InsertZoneForOrgVariables>;
}
export const insertZoneForOrgRef: InsertZoneForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertZoneForOrg(dc: DataConnect, vars: InsertZoneForOrgVariables): MutationPromise<InsertZoneForOrgData, InsertZoneForOrgVariables>;

interface InsertZoneForOrgRef {
  ...
  (dc: DataConnect, vars: InsertZoneForOrgVariables): MutationRef<InsertZoneForOrgData, InsertZoneForOrgVariables>;
}
export const insertZoneForOrgRef: InsertZoneForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertZoneForOrgRef:
```typescript
const name = insertZoneForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertZoneForOrg` mutation requires an argument of type `InsertZoneForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
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
```
### Return Type
Recall that executing the `InsertZoneForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertZoneForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertZoneForOrgData {
  zone_insert: Zone_Key;
}
```
### Using `InsertZoneForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertZoneForOrg, InsertZoneForOrgVariables } from '@dataconnect/generated';

// The `InsertZoneForOrg` mutation requires an argument of type `InsertZoneForOrgVariables`:
const insertZoneForOrgVars: InsertZoneForOrgVariables = {
  orgId: ..., 
  zoneId: ..., 
  clientId: ..., 
  zone: ..., // optional
  function: ..., // optional
  editedBy: ..., // optional
  date: ..., // optional
  location: ..., // optional
};

// Call the `insertZoneForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertZoneForOrg(insertZoneForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertZoneForOrg({ orgId: ..., zoneId: ..., clientId: ..., zone: ..., function: ..., editedBy: ..., date: ..., location: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertZoneForOrg(dataConnect, insertZoneForOrgVars);

console.log(data.zone_insert);

// Or, you can use the `Promise` API.
insertZoneForOrg(insertZoneForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.zone_insert);
});
```

### Using `InsertZoneForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertZoneForOrgRef, InsertZoneForOrgVariables } from '@dataconnect/generated';

// The `InsertZoneForOrg` mutation requires an argument of type `InsertZoneForOrgVariables`:
const insertZoneForOrgVars: InsertZoneForOrgVariables = {
  orgId: ..., 
  zoneId: ..., 
  clientId: ..., 
  zone: ..., // optional
  function: ..., // optional
  editedBy: ..., // optional
  date: ..., // optional
  location: ..., // optional
};

// Call the `insertZoneForOrgRef()` function to get a reference to the mutation.
const ref = insertZoneForOrgRef(insertZoneForOrgVars);
// Variables can be defined inline as well.
const ref = insertZoneForOrgRef({ orgId: ..., zoneId: ..., clientId: ..., zone: ..., function: ..., editedBy: ..., date: ..., location: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertZoneForOrgRef(dataConnect, insertZoneForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.zone_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.zone_insert);
});
```

## UpdateZoneForOrg
You can execute the `UpdateZoneForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateZoneForOrg(vars: UpdateZoneForOrgVariables): MutationPromise<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;

interface UpdateZoneForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateZoneForOrgVariables): MutationRef<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;
}
export const updateZoneForOrgRef: UpdateZoneForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateZoneForOrg(dc: DataConnect, vars: UpdateZoneForOrgVariables): MutationPromise<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;

interface UpdateZoneForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateZoneForOrgVariables): MutationRef<UpdateZoneForOrgData, UpdateZoneForOrgVariables>;
}
export const updateZoneForOrgRef: UpdateZoneForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateZoneForOrgRef:
```typescript
const name = updateZoneForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateZoneForOrg` mutation requires an argument of type `UpdateZoneForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
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
```
### Return Type
Recall that executing the `UpdateZoneForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateZoneForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateZoneForOrgData {
  zone_update?: Zone_Key | null;
}
```
### Using `UpdateZoneForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateZoneForOrg, UpdateZoneForOrgVariables } from '@dataconnect/generated';

// The `UpdateZoneForOrg` mutation requires an argument of type `UpdateZoneForOrgVariables`:
const updateZoneForOrgVars: UpdateZoneForOrgVariables = {
  orgId: ..., 
  zoneId: ..., 
  clientId: ..., 
  zone: ..., // optional
  function: ..., // optional
  editedBy: ..., // optional
  date: ..., // optional
  location: ..., // optional
};

// Call the `updateZoneForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateZoneForOrg(updateZoneForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateZoneForOrg({ orgId: ..., zoneId: ..., clientId: ..., zone: ..., function: ..., editedBy: ..., date: ..., location: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateZoneForOrg(dataConnect, updateZoneForOrgVars);

console.log(data.zone_update);

// Or, you can use the `Promise` API.
updateZoneForOrg(updateZoneForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.zone_update);
});
```

### Using `UpdateZoneForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateZoneForOrgRef, UpdateZoneForOrgVariables } from '@dataconnect/generated';

// The `UpdateZoneForOrg` mutation requires an argument of type `UpdateZoneForOrgVariables`:
const updateZoneForOrgVars: UpdateZoneForOrgVariables = {
  orgId: ..., 
  zoneId: ..., 
  clientId: ..., 
  zone: ..., // optional
  function: ..., // optional
  editedBy: ..., // optional
  date: ..., // optional
  location: ..., // optional
};

// Call the `updateZoneForOrgRef()` function to get a reference to the mutation.
const ref = updateZoneForOrgRef(updateZoneForOrgVars);
// Variables can be defined inline as well.
const ref = updateZoneForOrgRef({ orgId: ..., zoneId: ..., clientId: ..., zone: ..., function: ..., editedBy: ..., date: ..., location: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateZoneForOrgRef(dataConnect, updateZoneForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.zone_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.zone_update);
});
```

## DeleteZoneForOrg
You can execute the `DeleteZoneForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteZoneForOrg(vars: DeleteZoneForOrgVariables): MutationPromise<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;

interface DeleteZoneForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteZoneForOrgVariables): MutationRef<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;
}
export const deleteZoneForOrgRef: DeleteZoneForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteZoneForOrg(dc: DataConnect, vars: DeleteZoneForOrgVariables): MutationPromise<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;

interface DeleteZoneForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteZoneForOrgVariables): MutationRef<DeleteZoneForOrgData, DeleteZoneForOrgVariables>;
}
export const deleteZoneForOrgRef: DeleteZoneForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteZoneForOrgRef:
```typescript
const name = deleteZoneForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteZoneForOrg` mutation requires an argument of type `DeleteZoneForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteZoneForOrgVariables {
  orgId: string;
  zoneId: string;
}
```
### Return Type
Recall that executing the `DeleteZoneForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteZoneForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteZoneForOrgData {
  zone_delete?: Zone_Key | null;
}
```
### Using `DeleteZoneForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteZoneForOrg, DeleteZoneForOrgVariables } from '@dataconnect/generated';

// The `DeleteZoneForOrg` mutation requires an argument of type `DeleteZoneForOrgVariables`:
const deleteZoneForOrgVars: DeleteZoneForOrgVariables = {
  orgId: ..., 
  zoneId: ..., 
};

// Call the `deleteZoneForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteZoneForOrg(deleteZoneForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteZoneForOrg({ orgId: ..., zoneId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteZoneForOrg(dataConnect, deleteZoneForOrgVars);

console.log(data.zone_delete);

// Or, you can use the `Promise` API.
deleteZoneForOrg(deleteZoneForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.zone_delete);
});
```

### Using `DeleteZoneForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteZoneForOrgRef, DeleteZoneForOrgVariables } from '@dataconnect/generated';

// The `DeleteZoneForOrg` mutation requires an argument of type `DeleteZoneForOrgVariables`:
const deleteZoneForOrgVars: DeleteZoneForOrgVariables = {
  orgId: ..., 
  zoneId: ..., 
};

// Call the `deleteZoneForOrgRef()` function to get a reference to the mutation.
const ref = deleteZoneForOrgRef(deleteZoneForOrgVars);
// Variables can be defined inline as well.
const ref = deleteZoneForOrgRef({ orgId: ..., zoneId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteZoneForOrgRef(dataConnect, deleteZoneForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.zone_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.zone_delete);
});
```

## InsertWorkdayForOrg
You can execute the `InsertWorkdayForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertWorkdayForOrg(vars: InsertWorkdayForOrgVariables): MutationPromise<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;

interface InsertWorkdayForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertWorkdayForOrgVariables): MutationRef<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;
}
export const insertWorkdayForOrgRef: InsertWorkdayForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertWorkdayForOrg(dc: DataConnect, vars: InsertWorkdayForOrgVariables): MutationPromise<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;

interface InsertWorkdayForOrgRef {
  ...
  (dc: DataConnect, vars: InsertWorkdayForOrgVariables): MutationRef<InsertWorkdayForOrgData, InsertWorkdayForOrgVariables>;
}
export const insertWorkdayForOrgRef: InsertWorkdayForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertWorkdayForOrgRef:
```typescript
const name = insertWorkdayForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertWorkdayForOrg` mutation requires an argument of type `InsertWorkdayForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
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
```
### Return Type
Recall that executing the `InsertWorkdayForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertWorkdayForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertWorkdayForOrgData {
  workday_insert: Workday_Key;
}
```
### Using `InsertWorkdayForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertWorkdayForOrg, InsertWorkdayForOrgVariables } from '@dataconnect/generated';

// The `InsertWorkdayForOrg` mutation requires an argument of type `InsertWorkdayForOrgVariables`:
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
  comment: ..., // optional
  updatedBy: ..., // optional
};

// Call the `insertWorkdayForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertWorkdayForOrg(insertWorkdayForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertWorkdayForOrg({ orgId: ..., workdayId: ..., workerLogin: ..., workerName: ..., utilityRoomId: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., comment: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertWorkdayForOrg(dataConnect, insertWorkdayForOrgVars);

console.log(data.workday_insert);

// Or, you can use the `Promise` API.
insertWorkdayForOrg(insertWorkdayForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workday_insert);
});
```

### Using `InsertWorkdayForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertWorkdayForOrgRef, InsertWorkdayForOrgVariables } from '@dataconnect/generated';

// The `InsertWorkdayForOrg` mutation requires an argument of type `InsertWorkdayForOrgVariables`:
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
  comment: ..., // optional
  updatedBy: ..., // optional
};

// Call the `insertWorkdayForOrgRef()` function to get a reference to the mutation.
const ref = insertWorkdayForOrgRef(insertWorkdayForOrgVars);
// Variables can be defined inline as well.
const ref = insertWorkdayForOrgRef({ orgId: ..., workdayId: ..., workerLogin: ..., workerName: ..., utilityRoomId: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., comment: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertWorkdayForOrgRef(dataConnect, insertWorkdayForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.workday_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.workday_insert);
});
```

## UpdateWorkdayForOrg
You can execute the `UpdateWorkdayForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateWorkdayForOrg(vars: UpdateWorkdayForOrgVariables): MutationPromise<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;

interface UpdateWorkdayForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateWorkdayForOrgVariables): MutationRef<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;
}
export const updateWorkdayForOrgRef: UpdateWorkdayForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateWorkdayForOrg(dc: DataConnect, vars: UpdateWorkdayForOrgVariables): MutationPromise<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;

interface UpdateWorkdayForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateWorkdayForOrgVariables): MutationRef<UpdateWorkdayForOrgData, UpdateWorkdayForOrgVariables>;
}
export const updateWorkdayForOrgRef: UpdateWorkdayForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateWorkdayForOrgRef:
```typescript
const name = updateWorkdayForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateWorkdayForOrg` mutation requires an argument of type `UpdateWorkdayForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
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
```
### Return Type
Recall that executing the `UpdateWorkdayForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateWorkdayForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateWorkdayForOrgData {
  workday_update?: Workday_Key | null;
}
```
### Using `UpdateWorkdayForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateWorkdayForOrg, UpdateWorkdayForOrgVariables } from '@dataconnect/generated';

// The `UpdateWorkdayForOrg` mutation requires an argument of type `UpdateWorkdayForOrgVariables`:
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
  comment: ..., // optional
  updatedBy: ..., // optional
};

// Call the `updateWorkdayForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateWorkdayForOrg(updateWorkdayForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateWorkdayForOrg({ orgId: ..., workdayId: ..., workerLogin: ..., workerName: ..., utilityRoomId: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., comment: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateWorkdayForOrg(dataConnect, updateWorkdayForOrgVars);

console.log(data.workday_update);

// Or, you can use the `Promise` API.
updateWorkdayForOrg(updateWorkdayForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workday_update);
});
```

### Using `UpdateWorkdayForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateWorkdayForOrgRef, UpdateWorkdayForOrgVariables } from '@dataconnect/generated';

// The `UpdateWorkdayForOrg` mutation requires an argument of type `UpdateWorkdayForOrgVariables`:
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
  comment: ..., // optional
  updatedBy: ..., // optional
};

// Call the `updateWorkdayForOrgRef()` function to get a reference to the mutation.
const ref = updateWorkdayForOrgRef(updateWorkdayForOrgVars);
// Variables can be defined inline as well.
const ref = updateWorkdayForOrgRef({ orgId: ..., workdayId: ..., workerLogin: ..., workerName: ..., utilityRoomId: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., comment: ..., updatedBy: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateWorkdayForOrgRef(dataConnect, updateWorkdayForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.workday_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.workday_update);
});
```

## DeleteWorkdayForOrg
You can execute the `DeleteWorkdayForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteWorkdayForOrg(vars: DeleteWorkdayForOrgVariables): MutationPromise<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;

interface DeleteWorkdayForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteWorkdayForOrgVariables): MutationRef<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;
}
export const deleteWorkdayForOrgRef: DeleteWorkdayForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteWorkdayForOrg(dc: DataConnect, vars: DeleteWorkdayForOrgVariables): MutationPromise<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;

interface DeleteWorkdayForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteWorkdayForOrgVariables): MutationRef<DeleteWorkdayForOrgData, DeleteWorkdayForOrgVariables>;
}
export const deleteWorkdayForOrgRef: DeleteWorkdayForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteWorkdayForOrgRef:
```typescript
const name = deleteWorkdayForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteWorkdayForOrg` mutation requires an argument of type `DeleteWorkdayForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteWorkdayForOrgVariables {
  orgId: string;
  workdayId: string;
}
```
### Return Type
Recall that executing the `DeleteWorkdayForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteWorkdayForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteWorkdayForOrgData {
  workday_delete?: Workday_Key | null;
}
```
### Using `DeleteWorkdayForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteWorkdayForOrg, DeleteWorkdayForOrgVariables } from '@dataconnect/generated';

// The `DeleteWorkdayForOrg` mutation requires an argument of type `DeleteWorkdayForOrgVariables`:
const deleteWorkdayForOrgVars: DeleteWorkdayForOrgVariables = {
  orgId: ..., 
  workdayId: ..., 
};

// Call the `deleteWorkdayForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteWorkdayForOrg(deleteWorkdayForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteWorkdayForOrg({ orgId: ..., workdayId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteWorkdayForOrg(dataConnect, deleteWorkdayForOrgVars);

console.log(data.workday_delete);

// Or, you can use the `Promise` API.
deleteWorkdayForOrg(deleteWorkdayForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.workday_delete);
});
```

### Using `DeleteWorkdayForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteWorkdayForOrgRef, DeleteWorkdayForOrgVariables } from '@dataconnect/generated';

// The `DeleteWorkdayForOrg` mutation requires an argument of type `DeleteWorkdayForOrgVariables`:
const deleteWorkdayForOrgVars: DeleteWorkdayForOrgVariables = {
  orgId: ..., 
  workdayId: ..., 
};

// Call the `deleteWorkdayForOrgRef()` function to get a reference to the mutation.
const ref = deleteWorkdayForOrgRef(deleteWorkdayForOrgVars);
// Variables can be defined inline as well.
const ref = deleteWorkdayForOrgRef({ orgId: ..., workdayId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteWorkdayForOrgRef(dataConnect, deleteWorkdayForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.workday_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.workday_delete);
});
```

## InsertEventForOrg
You can execute the `InsertEventForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertEventForOrg(vars: InsertEventForOrgVariables): MutationPromise<InsertEventForOrgData, InsertEventForOrgVariables>;

interface InsertEventForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertEventForOrgVariables): MutationRef<InsertEventForOrgData, InsertEventForOrgVariables>;
}
export const insertEventForOrgRef: InsertEventForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertEventForOrg(dc: DataConnect, vars: InsertEventForOrgVariables): MutationPromise<InsertEventForOrgData, InsertEventForOrgVariables>;

interface InsertEventForOrgRef {
  ...
  (dc: DataConnect, vars: InsertEventForOrgVariables): MutationRef<InsertEventForOrgData, InsertEventForOrgVariables>;
}
export const insertEventForOrgRef: InsertEventForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertEventForOrgRef:
```typescript
const name = insertEventForOrgRef.operationName;
console.log(name);
```

### Variables
The `InsertEventForOrg` mutation requires an argument of type `InsertEventForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
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
```
### Return Type
Recall that executing the `InsertEventForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertEventForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertEventForOrgData {
  event_insert: BackupCycle_Key;
}
```
### Using `InsertEventForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertEventForOrg, InsertEventForOrgVariables } from '@dataconnect/generated';

// The `InsertEventForOrg` mutation requires an argument of type `InsertEventForOrgVariables`:
const insertEventForOrgVars: InsertEventForOrgVariables = {
  orgId: ..., 
  eventId: ..., 
  zoneId: ..., // optional
  workerLogin: ..., // optional
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

// Call the `insertEventForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertEventForOrg(insertEventForOrgVars);
// Variables can be defined inline as well.
const { data } = await insertEventForOrg({ orgId: ..., eventId: ..., zoneId: ..., workerLogin: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., closeMarkedAt: ..., endReason: ..., comment: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertEventForOrg(dataConnect, insertEventForOrgVars);

console.log(data.event_insert);

// Or, you can use the `Promise` API.
insertEventForOrg(insertEventForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.event_insert);
});
```

### Using `InsertEventForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertEventForOrgRef, InsertEventForOrgVariables } from '@dataconnect/generated';

// The `InsertEventForOrg` mutation requires an argument of type `InsertEventForOrgVariables`:
const insertEventForOrgVars: InsertEventForOrgVariables = {
  orgId: ..., 
  eventId: ..., 
  zoneId: ..., // optional
  workerLogin: ..., // optional
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

// Call the `insertEventForOrgRef()` function to get a reference to the mutation.
const ref = insertEventForOrgRef(insertEventForOrgVars);
// Variables can be defined inline as well.
const ref = insertEventForOrgRef({ orgId: ..., eventId: ..., zoneId: ..., workerLogin: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., closeMarkedAt: ..., endReason: ..., comment: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertEventForOrgRef(dataConnect, insertEventForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.event_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.event_insert);
});
```

## UpdateEventForOrg
You can execute the `UpdateEventForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateEventForOrg(vars: UpdateEventForOrgVariables): MutationPromise<UpdateEventForOrgData, UpdateEventForOrgVariables>;

interface UpdateEventForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateEventForOrgVariables): MutationRef<UpdateEventForOrgData, UpdateEventForOrgVariables>;
}
export const updateEventForOrgRef: UpdateEventForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateEventForOrg(dc: DataConnect, vars: UpdateEventForOrgVariables): MutationPromise<UpdateEventForOrgData, UpdateEventForOrgVariables>;

interface UpdateEventForOrgRef {
  ...
  (dc: DataConnect, vars: UpdateEventForOrgVariables): MutationRef<UpdateEventForOrgData, UpdateEventForOrgVariables>;
}
export const updateEventForOrgRef: UpdateEventForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateEventForOrgRef:
```typescript
const name = updateEventForOrgRef.operationName;
console.log(name);
```

### Variables
The `UpdateEventForOrg` mutation requires an argument of type `UpdateEventForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
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
```
### Return Type
Recall that executing the `UpdateEventForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateEventForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateEventForOrgData {
  event_update?: BackupCycle_Key | null;
}
```
### Using `UpdateEventForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateEventForOrg, UpdateEventForOrgVariables } from '@dataconnect/generated';

// The `UpdateEventForOrg` mutation requires an argument of type `UpdateEventForOrgVariables`:
const updateEventForOrgVars: UpdateEventForOrgVariables = {
  orgId: ..., 
  eventId: ..., 
  zoneId: ..., // optional
  workerLogin: ..., // optional
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

// Call the `updateEventForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateEventForOrg(updateEventForOrgVars);
// Variables can be defined inline as well.
const { data } = await updateEventForOrg({ orgId: ..., eventId: ..., zoneId: ..., workerLogin: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., closeMarkedAt: ..., endReason: ..., comment: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateEventForOrg(dataConnect, updateEventForOrgVars);

console.log(data.event_update);

// Or, you can use the `Promise` API.
updateEventForOrg(updateEventForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.event_update);
});
```

### Using `UpdateEventForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateEventForOrgRef, UpdateEventForOrgVariables } from '@dataconnect/generated';

// The `UpdateEventForOrg` mutation requires an argument of type `UpdateEventForOrgVariables`:
const updateEventForOrgVars: UpdateEventForOrgVariables = {
  orgId: ..., 
  eventId: ..., 
  zoneId: ..., // optional
  workerLogin: ..., // optional
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

// Call the `updateEventForOrgRef()` function to get a reference to the mutation.
const ref = updateEventForOrgRef(updateEventForOrgVars);
// Variables can be defined inline as well.
const ref = updateEventForOrgRef({ orgId: ..., eventId: ..., zoneId: ..., workerLogin: ..., startAt: ..., endAt: ..., durationSec: ..., status: ..., closeMarkedAt: ..., endReason: ..., comment: ..., deviceId: ..., startEventId: ..., endEventId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateEventForOrgRef(dataConnect, updateEventForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.event_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.event_update);
});
```

## DeleteEventForOrg
You can execute the `DeleteEventForOrg` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteEventForOrg(vars: DeleteEventForOrgVariables): MutationPromise<DeleteEventForOrgData, DeleteEventForOrgVariables>;

interface DeleteEventForOrgRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteEventForOrgVariables): MutationRef<DeleteEventForOrgData, DeleteEventForOrgVariables>;
}
export const deleteEventForOrgRef: DeleteEventForOrgRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteEventForOrg(dc: DataConnect, vars: DeleteEventForOrgVariables): MutationPromise<DeleteEventForOrgData, DeleteEventForOrgVariables>;

interface DeleteEventForOrgRef {
  ...
  (dc: DataConnect, vars: DeleteEventForOrgVariables): MutationRef<DeleteEventForOrgData, DeleteEventForOrgVariables>;
}
export const deleteEventForOrgRef: DeleteEventForOrgRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteEventForOrgRef:
```typescript
const name = deleteEventForOrgRef.operationName;
console.log(name);
```

### Variables
The `DeleteEventForOrg` mutation requires an argument of type `DeleteEventForOrgVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteEventForOrgVariables {
  orgId: string;
  eventId: string;
}
```
### Return Type
Recall that executing the `DeleteEventForOrg` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteEventForOrgData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteEventForOrgData {
  event_delete?: BackupCycle_Key | null;
}
```
### Using `DeleteEventForOrg`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteEventForOrg, DeleteEventForOrgVariables } from '@dataconnect/generated';

// The `DeleteEventForOrg` mutation requires an argument of type `DeleteEventForOrgVariables`:
const deleteEventForOrgVars: DeleteEventForOrgVariables = {
  orgId: ..., 
  eventId: ..., 
};

// Call the `deleteEventForOrg()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteEventForOrg(deleteEventForOrgVars);
// Variables can be defined inline as well.
const { data } = await deleteEventForOrg({ orgId: ..., eventId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteEventForOrg(dataConnect, deleteEventForOrgVars);

console.log(data.event_delete);

// Or, you can use the `Promise` API.
deleteEventForOrg(deleteEventForOrgVars).then((response) => {
  const data = response.data;
  console.log(data.event_delete);
});
```

### Using `DeleteEventForOrg`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteEventForOrgRef, DeleteEventForOrgVariables } from '@dataconnect/generated';

// The `DeleteEventForOrg` mutation requires an argument of type `DeleteEventForOrgVariables`:
const deleteEventForOrgVars: DeleteEventForOrgVariables = {
  orgId: ..., 
  eventId: ..., 
};

// Call the `deleteEventForOrgRef()` function to get a reference to the mutation.
const ref = deleteEventForOrgRef(deleteEventForOrgVars);
// Variables can be defined inline as well.
const ref = deleteEventForOrgRef({ orgId: ..., eventId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteEventForOrgRef(dataConnect, deleteEventForOrgVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.event_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.event_delete);
});
```

