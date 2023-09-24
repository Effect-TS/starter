import { Effect, Option, Cause } from 'effect'
import * as Http from '@effect/platform-node/HttpClient'
import * as Node from '@effect/platform-node/Runtime'
import * as Command from '@effect/cli/Command'
import * as Cli from '@effect/cli/CliApp'
import * as Options from '@effect/cli/Options'
import * as Args from '@effect/cli/Args'
import * as Console from '@effect/cli/Console'
import * as Schema from '@effect/schema/Schema'

const WttrWeatherSchema = Schema.struct({
  date: Schema.dateFromString(Schema.string),
  avgtempC: Schema.numberFromString(Schema.string),
  avgtempF: Schema.numberFromString(Schema.string),
  maxtempC: Schema.numberFromString(Schema.string),
  maxtempF: Schema.numberFromString(Schema.string),
  mintempC: Schema.numberFromString(Schema.string),
  mintempF: Schema.numberFromString(Schema.string),
  sunHour: Schema.numberFromString(Schema.string),
  uvIndex: Schema.numberFromString(Schema.string)
})

const WttrResponseSchema = Schema.struct({
  weather: Schema.array(WttrWeatherSchema)
})

// Defines the command line interface for the `weather` command.
const cli = Cli.make({
  name: 'Weather',
  version: '1.2.3',
  command: Command.make('weather', {
    // Accept 0 or 1 arguments for the location and convert it to a `Option<string>`.
    args: Args.between(Args.text({ name: 'location' }), 0, 1).pipe(Args.map(Option.fromIterable)),
    options: Options.all({
      // Allow the user to override the default `wttr.in` service with the `--url` option.
      url: Options.withDefault(Options.text('url'), 'https://wttr.in'),
    }),
  })
})

// Runs the previously defined command line interface with the given arguments.
const main = (argv: string[]) => Cli.run(cli, argv, ({ options, args }) => {
  // Based on the given options and arguments, you could invoke different (sub)commands here or
  // pass different parameters to your command function. In this example, we only have a single
  // command, so we just invoke it directly.
  return Effect.gen(function* ($) {
    const defaultClient = yield* $(Http.client.Client)
    const wttrClient = defaultClient.pipe(
      // Always prepend the service url to all requests. This makes it more convenient to use the client.
      Http.client.mapRequest(Http.request.prependUrl(options.url)),
      // Tell the wttr.in service to return json.
      Http.client.mapRequest(Http.request.appendUrlParam('format', 'j1')),
      // Only accept responses with a `2xx` status code. Fail otherwise.
      Http.client.filterStatusOk,
      // Decode all responses using the `WttrResponseSchema` schema.
      Http.client.mapEffect(Http.response.schemaBodyJson(WttrResponseSchema)),
    )
  
    // Create the weather request for the provided location or the current location if none was provided.
    const wttrRequest = Option.match(args, {
      onNone: () => Http.request.get('/'),
      onSome: (_) => Http.request.get(`/${encodeURIComponent(_)}`),
    })

    // Send the request and wait for the response, then extract the `.weather` property from the parsed object.
    const wttrResponse = yield* $(wttrClient(wttrRequest), Effect.map((_) => _.weather))
  
    // TODO: Pretty print the weather.
    yield* $(Effect.log(wttrResponse))
  })
})

// Obtain the command line arguments and invoke the main function.
const program = Effect.sync(() => process.argv.slice(2)).pipe(Effect.flatMap((_) => main(_)))

// Provide the required layers (a.k.a. dependency injection) to the program.
const runnable = program.pipe(
  Effect.provideSomeLayer(Console.layer),
  Effect.provideSomeLayer(Http.client.layer)
)

// Run the program and pretty print any errors.
Node.runMain(runnable.pipe(Effect.tapErrorCause((_) => Effect.logError(Cause.pretty(_)))))
