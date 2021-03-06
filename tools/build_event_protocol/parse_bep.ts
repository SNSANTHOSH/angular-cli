/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

/**
 * @fileoverview simple program to read the build event protocol and convert to
 * UI quasi-events.
 *
 * See the README.md in this directory for usage
 */

/// <reference types="node" />
import * as fs from 'fs';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import {BuildEvent} from 'angular_cli/third_party/github.com/bazelbuild/bazel/src/main/java/com/google/devtools/build/lib/buildeventstream/proto/build_event_stream_pb';

function updateUi(s: string, ...more: Array<{}>) {
  console.error('-->', s, ...more);
}

// typeof bes.BuildEventId.id
type payloadType = 'unknown'|'progress'|'started'|'unstructuredCommandLine'|
    'structuredCommandLine'|'workspaceStatus'|'optionsParsed'|'fetch'|
    'configuration'|'targetConfigured'|'pattern'|'patternSkipped'|'namedSet'|
    'targetCompleted'|'actionCompleted'|'unconfiguredLabel'|'configuredLabel'|
    'testResult'|'testSummary'|'buildFinished'|'buildToolLogs'|'buildMetrics';

function filterType(s: payloadType) {
  return filter((evt: BuildEvent) => {
    const id = evt.getId();
    if (!id) {
      throw new Error(`expected BuildEvent to contain id
        ${JSON.stringify(evt)}`);
    }
    return Object.keys(id)[0] === s;
  });
}

async function main(argv: string[]): Promise<0|1> {
  const s = new Subject<BuildEvent>();
  const o: Observable<BuildEvent> = s.asObservable();
  o.pipe(filterType('testSummary')).subscribe({
    next: (evt: BuildEvent) => {
      const id = evt.getId();
      if (!id || !id.getTestSummary() || !evt.getTestSummary()) {
        throw new Error(
            `expected BuildEvent to contain id, testSummary, id.testSummary
        ${JSON.stringify(evt)}`);
      }
      updateUi('Test result', {
        label: id.getTestSummary()!.getLabel(),
        overallStatus: evt.getTestSummary()!.getOverallStatus(),
      });
    }
  });

  o.pipe(filterType('buildFinished')).subscribe({
    next: (evt: BuildEvent) => {
      const finished = evt.getFinished();
      if (!finished || !finished.getExitCode()) {
        throw new Error(
            `expected BuildEvent to contain finished, finished.exitCode
          ${JSON.stringify(evt)}`);
      }
      const exitName = finished.getExitCode()!.getName();
      switch (exitName) {
        case 'SUCCESS':
          updateUi('Thumbs up');
          break;
        case 'TESTS_FAILED':
          updateUi('Some tests failed');
          break;
        case 'INTERRUPTED':
          updateUi('Cancelled');
          break;
        case 'PARSING_FAILURE':
          updateUi('Error in build configuration file, report to expert', {
            someDebugThatsUsefulToTheExpert: 'a-file-path',
          });
          break;
        default:
          throw new Error(`Unhandled exitName ${exitName}`);
      }
    },
    error: (e) => console.error('Unrecoverable error ', e)
  });

  // Push values into the subject
  // TODO: should be streaming from file
  // const stream = fs.createReadStream(argv[0]);
  // stream.on('data')
  // stream.on('end)
  // etc.
  const content = fs.readFileSync(argv[0], {'encoding': 'utf-8'});
  content.split(/[\r\n]+/).filter(l => !!l).forEach(
      evt => s.next(JSON.parse(evt)));
  s.complete();

  await o.toPromise();
  return 0;
}


if (require.main === module) {
  // Allow this program to run under bazel run
  const wd = process.env['BUILD_WORKING_DIRECTORY'];
  if (wd) {
    process.chdir(wd);
  }

  main(process.argv.slice(2))
      .then(exitCode => process.exitCode = exitCode, e => {
        throw new Error(e);
      });
}
