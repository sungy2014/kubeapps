import { createAction, getReturnOfExpression } from "typesafe-actions";

import { Dispatch } from "react-redux";
import { AppRepository } from "../shared/AppRepository";
import Secret from "../shared/Secret";

import { IAppRepository, IOwnerReference, IStoreState } from "../shared/types";

export const addRepo = createAction("ADD_REPO");
export const addedRepo = createAction("ADDED_REPO", (added: IAppRepository) => ({
  added,
  type: "ADDED_REPO",
}));
export const requestRepos = createAction("REQUEST_REPOS");
export const receiveRepos = createAction("RECEIVE_REPOS", (repos: IAppRepository[]) => {
  return {
    repos,
    type: "RECEIVE_REPOS",
  };
});
export const showForm = createAction("SHOW_FORM");
export const hideForm = createAction("HIDE_FORM");
export const resetForm = createAction("RESET_FORM");
export const submitForm = createAction("SUBMIT_FROM");
export const updateForm = createAction(
  "UPDATE_FORM",
  (values: { name?: string; namespace?: string; url?: string }) => {
    return {
      type: "UPDATE_FORM",
      values,
    };
  },
);
export const redirect = createAction("REDIRECT", (path: string) => ({ type: "REDIRECT", path }));
export const redirected = createAction("REDIRECTED");
export const errorRepos = createAction(
  "ERROR_REPOS",
  (err: Error, op: "create" | "update" | "fetch" | "delete") => ({
    err,
    op,
    type: "ERROR_REPOS",
  }),
);

const allActions = [
  addRepo,
  addedRepo,
  errorRepos,
  requestRepos,
  receiveRepos,
  resetForm,
  submitForm,
  updateForm,
  showForm,
  hideForm,
  redirect,
  redirected,
].map(getReturnOfExpression);
export type AppReposAction = typeof allActions[number];

export const deleteRepo = (name: string) => {
  return async (dispatch: Dispatch<IStoreState>) => {
    try {
      await AppRepository.delete(name);
      dispatch(fetchRepos());
      return true;
    } catch (e) {
      dispatch(errorRepos(e, "delete"));
      return false;
    }
  };
};

export const resyncRepo = (name: string) => {
  return async (dispatch: Dispatch<IStoreState>) => {
    try {
      const repo = await AppRepository.get(name);
      repo.spec.resyncRequests = repo.spec.resyncRequests || 0;
      repo.spec.resyncRequests++;
      await AppRepository.update(name, repo);
      // TODO: Do something to show progress
      dispatch(requestRepos());
      const repos = await AppRepository.list();
      dispatch(receiveRepos(repos.items));
    } catch (e) {
      dispatch(errorRepos(e, "update"));
    }
  };
};

export const fetchRepos = () => {
  return async (dispatch: Dispatch<IStoreState>) => {
    dispatch(requestRepos());
    try {
      const repos = await AppRepository.list();
      dispatch(receiveRepos(repos.items));
    } catch (e) {
      dispatch(errorRepos(e, "fetch"));
    }
  };
};

export const installRepo = (name: string, url: string, authHeader: string) => {
  return async (dispatch: Dispatch<IStoreState>) => {
    try {
      let auth;
      const secretName = `apprepo-${name}-secrets`;
      if (authHeader.length) {
        // ensure we can create secrets in the kubeapps namespace
        auth = {
          header: {
            secretKeyRef: {
              key: "authorizationHeader",
              name: secretName,
            },
          },
        };
      }
      dispatch(addRepo());
      const apprepo = await AppRepository.create(name, url, auth);
      dispatch(addedRepo(apprepo));

      if (authHeader.length) {
        await Secret.create(
          secretName,
          { authorizationHeader: btoa(authHeader) },
          {
            apiVersion: apprepo.apiVersion,
            blockOwnerDeletion: true,
            kind: apprepo.kind,
            name: apprepo.metadata.name,
            uid: apprepo.metadata.uid,
          } as IOwnerReference,
          "kubeapps",
        );
      }
      return true;
    } catch (e) {
      dispatch(errorRepos(e, "create"));
      return false;
    }
  };
};
