# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.




### React
For each operation, there is a wrapper hook that can be used to call the operation.

Here are all of the hooks that get generated:
```ts
import { useInsertClientForOrg, useUpdateClientForOrg, useDeleteClientForOrg, useInsertIndividualJobForOrg, useUpdateIndividualJobForOrg, useDeleteIndividualJobForOrg, useUpsertTaskForOrg, useDeleteTaskForOrg, useInsertZoneForOrg, useUpdateZoneForOrg } from '@dataconnect/generated/react';
// The types of these hooks are available in react/index.d.ts

const { data, isPending, isSuccess, isError, error } = useInsertClientForOrg(insertClientForOrgVars);

const { data, isPending, isSuccess, isError, error } = useUpdateClientForOrg(updateClientForOrgVars);

const { data, isPending, isSuccess, isError, error } = useDeleteClientForOrg(deleteClientForOrgVars);

const { data, isPending, isSuccess, isError, error } = useInsertIndividualJobForOrg(insertIndividualJobForOrgVars);

const { data, isPending, isSuccess, isError, error } = useUpdateIndividualJobForOrg(updateIndividualJobForOrgVars);

const { data, isPending, isSuccess, isError, error } = useDeleteIndividualJobForOrg(deleteIndividualJobForOrgVars);

const { data, isPending, isSuccess, isError, error } = useUpsertTaskForOrg(upsertTaskForOrgVars);

const { data, isPending, isSuccess, isError, error } = useDeleteTaskForOrg(deleteTaskForOrgVars);

const { data, isPending, isSuccess, isError, error } = useInsertZoneForOrg(insertZoneForOrgVars);

const { data, isPending, isSuccess, isError, error } = useUpdateZoneForOrg(updateZoneForOrgVars);

```

Here's an example from a different generated SDK:

```ts
import { useListAllMovies } from '@dataconnect/generated/react';

function MyComponent() {
  const { isLoading, data, error } = useListAllMovies();
  if(isLoading) {
    return <div>Loading...</div>
  }
  if(error) {
    return <div> An Error Occurred: {error} </div>
  }
}

// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyComponent from './my-component';

function App() {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>
    <MyComponent />
  </QueryClientProvider>
}
```



## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { insertClientForOrg, updateClientForOrg, deleteClientForOrg, insertIndividualJobForOrg, updateIndividualJobForOrg, deleteIndividualJobForOrg, upsertTaskForOrg, deleteTaskForOrg, insertZoneForOrg, updateZoneForOrg } from '@dataconnect/generated';


// Operation InsertClientForOrg:  For variables, look at type InsertClientForOrgVars in ../index.d.ts
const { data } = await InsertClientForOrg(dataConnect, insertClientForOrgVars);

// Operation UpdateClientForOrg:  For variables, look at type UpdateClientForOrgVars in ../index.d.ts
const { data } = await UpdateClientForOrg(dataConnect, updateClientForOrgVars);

// Operation DeleteClientForOrg:  For variables, look at type DeleteClientForOrgVars in ../index.d.ts
const { data } = await DeleteClientForOrg(dataConnect, deleteClientForOrgVars);

// Operation InsertIndividualJobForOrg:  For variables, look at type InsertIndividualJobForOrgVars in ../index.d.ts
const { data } = await InsertIndividualJobForOrg(dataConnect, insertIndividualJobForOrgVars);

// Operation UpdateIndividualJobForOrg:  For variables, look at type UpdateIndividualJobForOrgVars in ../index.d.ts
const { data } = await UpdateIndividualJobForOrg(dataConnect, updateIndividualJobForOrgVars);

// Operation DeleteIndividualJobForOrg:  For variables, look at type DeleteIndividualJobForOrgVars in ../index.d.ts
const { data } = await DeleteIndividualJobForOrg(dataConnect, deleteIndividualJobForOrgVars);

// Operation UpsertTaskForOrg:  For variables, look at type UpsertTaskForOrgVars in ../index.d.ts
const { data } = await UpsertTaskForOrg(dataConnect, upsertTaskForOrgVars);

// Operation DeleteTaskForOrg:  For variables, look at type DeleteTaskForOrgVars in ../index.d.ts
const { data } = await DeleteTaskForOrg(dataConnect, deleteTaskForOrgVars);

// Operation InsertZoneForOrg:  For variables, look at type InsertZoneForOrgVars in ../index.d.ts
const { data } = await InsertZoneForOrg(dataConnect, insertZoneForOrgVars);

// Operation UpdateZoneForOrg:  For variables, look at type UpdateZoneForOrgVars in ../index.d.ts
const { data } = await UpdateZoneForOrg(dataConnect, updateZoneForOrgVars);


```