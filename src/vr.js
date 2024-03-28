

let enterVR;
let xrSessionIsGranted = false;

function start( ) {

    if( enterVR ) enterVR();

}

function init( renderer ) {

    function showEnterVR( /*device*/ ) {

        document.body.classList.add("vr");

        let currentSession = null;

        async function onSessionStarted( session ) {

            session.addEventListener( 'end', onSessionEnded );

            await renderer.xr.setSession( session );
            
            currentSession = session;

        }

        function onSessionEnded( /*event*/ ) {

            currentSession.removeEventListener( 'end', onSessionEnded );

            currentSession = null;

        }

        //

        
        // WebXR's requestReferenceSpace only works if the corresponding feature
        // was requested at session creation time. For simplicity, just ask for
        // the interesting ones as optional features, but be aware that the
        // requestReferenceSpace call will fail if it turns out to be unavailable.
        // ('local' is always available for immersive sessions and doesn't need to
        // be requested separately.)

        const sessionInit = { optionalFeatures: [ 'local-floor', 'bounded-floor' ] };

        
        enterVR = function () {

            if ( currentSession === null ) {

                navigator.xr.requestSession( 'immersive-vr', sessionInit ).then( onSessionStarted );

            } else {

                currentSession.end();

                if ( navigator.xr.offerSession !== undefined ) {

                    navigator.xr.offerSession( 'immersive-vr', sessionInit )
                        .then( onSessionStarted )
                        .catch( ( err ) => {

                            console.warn( err );

                        } );

                }

            }

        };

        if ( navigator.xr.offerSession !== undefined ) {

            navigator.xr.offerSession( 'immersive-vr', sessionInit )
                .then( onSessionStarted )
                .catch( ( err ) => {

                    console.warn( err );

                } );

        }

    }

    

    function showVRNotAllowed( exception ) {

        enterVR = null;

        document.body.classList.remove("vr");

        console.warn( 'Exception when trying to call xr.isSessionSupported', exception );

        //button.textContent = 'VR NOT ALLOWED';

    }

    

    if ( 'xr' in navigator ) {

        navigator.xr.isSessionSupported( 'immersive-vr' ).then( function ( supported ) {

            supported ? showEnterVR() : showWebXRNotFound();

            if ( supported && xrSessionIsGranted ) {

                enterVR();

            }

        } ).catch( showVRNotAllowed );


    } 

}


if ( typeof navigator !== 'undefined' && 'xr' in navigator ) {

    // WebXRViewer (based on Firefox) has a bug where addEventListener
    // throws a silent exception and aborts execution entirely.
    if ( /WebXRViewer\//i.test( navigator.userAgent ) ) return;

    navigator.xr.addEventListener( 'sessiongranted', () => {

        xrSessionIsGranted = true;

    } );

}

	





export { init, start };