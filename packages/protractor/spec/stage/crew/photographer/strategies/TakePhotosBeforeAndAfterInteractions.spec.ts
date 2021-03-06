import 'mocha';

import { EventRecorder, expect, PickEvent } from '@integration/testing-tools';
import { Duration } from '@serenity-js/core';
import { ActivityFinished, ActivityRelatedArtifactGenerated, ActivityStarts, ArtifactGenerated, DomainEvent } from '@serenity-js/core/lib/events';
import { CorrelationId, Photo } from '@serenity-js/core/lib/model';
import { Stage } from '@serenity-js/core/lib/stage';
import { protractor } from 'protractor';

import { Photographer, TakePhotosBeforeAndAfterInteractions } from '../../../../../src/stage';
import { create } from '../create';
import { Perform } from '../fixtures';

describe('Photographer', function () {

    this.timeout(5000);

    describe('when instructed to take photos before and after all interactions', () => {

        let photographer: Photographer,
            stage: Stage,
            recorder: EventRecorder;

        beforeEach(() => {
            const testSubject = create(Duration.ofSeconds(3));
            stage = testSubject.stage;
            recorder = testSubject.recorder;

            photographer = new Photographer(new TakePhotosBeforeAndAfterInteractions(), stage);
            stage.assign(photographer);
        });

        it('takes a before and after photo when the interaction goes well', () =>
            expect(stage.theActorCalled('Betty').attemptsTo(
                Perform.interactionThatSucceeds(1),
            )).to.be.fulfilled.then(() => stage.waitForNextCue().then(() => {

                PickEvent.from(recorder.events)
                    .next(ArtifactGenerated, event => {
                        expect(event.name.value).to.match(/Before Betty succeeds \(#1\)$/);
                        expect(event.artifact).to.be.instanceof(Photo);
                    })
                    .next(ArtifactGenerated, event => {
                        expect(event.name.value).to.match(/After Betty succeeds \(#1\)$/);
                        expect(event.artifact).to.be.instanceof(Photo);
                    });
            })));

        it('takes a photo when a problem occurs', () =>
            expect(stage.theActorCalled('Betty').attemptsTo(
                Perform.interactionThatFailsWith(Error),
            )).to.be.rejected.then(() => stage.waitForNextCue().then(() => {

                PickEvent.from(recorder.events)
                    .next(ArtifactGenerated, event => {
                        expect(event.name.value).to.match(/Before Betty fails due to Error$/);
                        expect(event.artifact).to.be.instanceof(Photo);
                    })
                    .next(ArtifactGenerated, event => {
                        expect(event.name.value).to.match(/After Betty fails due to Error$/);
                        expect(event.artifact).to.be.instanceof(Photo);
                    });
            })));

        it('takes a photo before and after Interaction, even though nested tasks might all be marked as failing', () =>
            expect(stage.theActorCalled('Betty').attemptsTo(
                Perform.taskWith(
                    Perform.taskWith(
                        Perform.interactionThatFailsWith(TypeError),
                    ),
                ),
            )).to.be.rejected.then(() => stage.waitForNextCue().then(() => {

                PickEvent.from(recorder.events)
                    .next(ArtifactGenerated, event => {
                        expect(event.name.value).to.match(/Before Betty fails due to TypeError$/);
                        expect(event.artifact).to.be.instanceof(Photo);
                    })
                    .next(ArtifactGenerated, event => {
                        expect(event.name.value).to.match(/After Betty fails due to TypeError$/);
                        expect(event.artifact).to.be.instanceof(Photo);
                    });
            })));

        it('takes two photos per interaction', () =>
            expect(stage.theActorCalled('Betty').attemptsTo(
                Perform.interactionThatSucceeds(1),
                Perform.interactionThatSucceeds(2),
            )).to.be.fulfilled.then(() => stage.waitForNextCue().then(() => {

                let cid1: CorrelationId,
                    cid2: CorrelationId;

                PickEvent.from(recorder.events)
                    .next(ActivityStarts, event => { cid1 = event.value.correlationId; })
                    .next(ActivityStarts, event => { cid2 = event.value.correlationId; });

                const
                    firstActivityEvents  = recorder.events.filter(withCorrelationIdOf(cid1)),
                    secondActivityEvents = recorder.events.filter(withCorrelationIdOf(cid2));

                expect(firstActivityEvents).to.have.lengthOf(4);
                expect(secondActivityEvents).to.have.lengthOf(4);

                PickEvent.from(firstActivityEvents)
                    .next(ArtifactGenerated, event => {
                        expect(event.name.value).to.match(/Before Betty succeeds \(#1\)$/);
                        expect(event.artifact).to.be.instanceof(Photo);
                    })
                    .next(ArtifactGenerated, event => {
                        expect(event.name.value).to.match(/After Betty succeeds \(#1\)$/);
                        expect(event.artifact).to.be.instanceof(Photo);
                    });

                PickEvent.from(secondActivityEvents)
                    .next(ArtifactGenerated, event => {
                        expect(event.name.value).to.match(/Before Betty succeeds \(#2\)$/);
                        expect(event.artifact).to.be.instanceof(Photo);
                    })
                    .next(ArtifactGenerated, event => {
                        expect(event.name.value).to.match(/After Betty succeeds \(#2\)$/);
                        expect(event.artifact).to.be.instanceof(Photo);
                    });
            })));

        it('includes the browser context in the name of the emitted artifact', () =>
            expect(stage.theActorCalled('Betty').attemptsTo(
                Perform.interactionThatSucceeds(1),
            )).to.be.fulfilled.then(() => stage.waitForNextCue().
            then(() => protractor.browser.getCapabilities()).
            then(capabilities => {

                PickEvent.from(recorder.events)
                    .next(ArtifactGenerated, event => {
                        expect(event.name.value).to.equal(
                            `${ capabilities.get('platform') }-${ capabilities.get('browserName') }-${ capabilities.get('version') }-Before Betty succeeds (#1)`,
                        );
                        expect(event.artifact).to.be.instanceof(Photo);
                    })
                    .next(ArtifactGenerated, event => {
                        expect(event.name.value).to.equal(
                            `${ capabilities.get('platform') }-${ capabilities.get('browserName') }-${ capabilities.get('version') }-After Betty succeeds (#1)`,
                        );
                        expect(event.artifact).to.be.instanceof(Photo);
                    });
            })));

        function withCorrelationIdOf(cid: CorrelationId) {
            return (event: DomainEvent) => {
                const details = (event as ActivityRelatedArtifactGenerated).details || (event as ActivityStarts | ActivityFinished).value;

                return details && cid.equals(details.correlationId);
            };
        }
    });
});
