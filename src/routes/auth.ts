import {NextFunction, Request, Response} from 'express'
import config from '../config'
import {sortFormFields} from '../translations'
import {
  AdminApi,
  FormField,
  LoginFlow,
  RegistrationFlow,
} from '@oryd/kratos-client'
import {IncomingMessage} from 'http'
import {isString} from "../helpers";

const kratos = new AdminApi(config.kratos.admin)

// A simple express handler that shows the login / registration screen.
// Argument "type" can either be "login" or "registration" and will
// fetch the form data from ORY Kratos's Public API.
export const authHandler = (type: 'login' | 'registration') => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const flow = req.query.flow

  // The flow is used to identify the login and registration flow and
  // return data like the csrf_token and so on.
  if (!flow || !isString(flow)) {
    console.log('No flow ID found in URL, initializing auth flow.')
    res.redirect(
      `${config.kratos.browser}/self-service/${type}/browser`
    )
    return
  }

  const authRequest: Promise<{
    response: IncomingMessage
    body?: LoginFlow | RegistrationFlow
  }> =
    type === 'login'
      ? kratos.getSelfServiceLoginFlow(flow)
      : kratos.getSelfServiceRegistrationFlow(flow)

  authRequest
    .then(({body, response}) => {
      if (response.statusCode == 404 || response.statusCode == 410 || response.statusCode == 403) {
        res.redirect(
          `${config.kratos.browser}/self-service/${type}/browser`
        )
        return
      } else if (response.statusCode != 200) {
        return Promise.reject(body)
      }

      return body
    })
    .then((request?: LoginFlow | RegistrationFlow) => {
      if (!request) {
        res.redirect(
          `${config.kratos.browser}/self-service/${type}/browser`
        )
        return
      }

      if (request.methods.password.config?.fields) {
        // We want the form fields to be sorted so that the email address is first, the
        // password second, and so on.
        request.methods.password.config.fields = request.methods.password.config.fields.sort(sortFormFields)
      }

      // This helper returns a flow method config (e.g. for the password flow).
      // If active is set and not the given flow method key, it wil be omitted.
      // This prevents the user from e.g. signing up with email but still seeing
      // other sign up form elements when an input is incorrect.
      const methodConfig = (key: string) => {
        if (request?.active === key || !request?.active) {
          return request?.methods[key]?.config
        }
      }

      res.render(type, {
        ...request,
        oidc: methodConfig("oidc"),
        password: methodConfig("password"),
      })
    })
    .catch(next)
}
