import { useState, useRef, useMemo, useEffect } from 'react';
import Loading from '../components/Loading';
import { FingerPoseEstimator } from '../FingerUtils/FingerPostEstimator';
import reactToDOMCursor from '../HandUtils/reactToDom';
import { fourLetterWords } from '../data/words';
import { getLevelWords } from '../utils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HandAnalyzer } from '../HandUtils/HandAnalyzer';
import BackButton from '../components/BackButton';
import moment from 'moment';
import Modal from '../components/Modal/Modal';
import ImageAndWordContainer from '../components/ImageAndWordContainer';
import LeftBottomContainer from '../components/LeftBottomContainer';
import StartingVideoOverLay from '../components/StartingVideoOverLay';
import WavingVideo from '../components/WavingVideo';
import { AlphabetDefinationI } from '../type';
import { Alphabet } from '../data/Alphabet';
import Percentage from '../components/Percentage';
const handAnalyzer = new HandAnalyzer();
let ignore = false;
type handDirection = 'left' | 'right';
function Game() {
  const navigate = useNavigate();
  const searchParams = useSearchParams();
  const [lookForLetter, setLookForLetter] = useState<AlphabetDefinationI>();
  const hand = searchParams[0].get('hand') as handDirection;
  const [level, setLevel] = useState<number>();
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [startTime, setStartTime] = useState<Date | undefined>();
  const [currentTime, setCurrentTime] = useState<Date | undefined>();
  const [wordIndex, setWordIndex] = useState(0);
  const [levelWords, setLevelWords] = useState<Array<string>>([]);
  const [wordLength, setWordLength] = useState(1);
  const [selectedWord, setSelectWord] = useState<string>();
  const [selectedLetter, setSelectedLetter] = useState<string>();
  const [score, setScore] = useState(0);
  const [showModal, setShowModal] = useState(false);

  let [countPrediction, setCountPrediction] = useState(0);
  const videoElement = useRef(null);
  const canvasElement = useRef<HTMLCanvasElement>(null);

  const handleSkip = () => {
    //level compelted go to level completed page
    if (wordIndex == 9) {
      navigate(`/level-completed?hand=${hand}&level=${level}&points=${score}`);
    }
    if (wordLength == 4 && selectedWord) {
      setSelectWord(levelWords[wordIndex + 1]);
      setWordLength(1);
      setWordIndex((prevWordIndex) => prevWordIndex + 1);
      setSelectedLetter(levelWords[wordIndex + 1][0]);
    } else if (wordLength != 4 && selectedWord) {
      setWordLength(wordLength + 1);
      setSelectedLetter(selectedWord[wordLength]);
      setWordLength(wordLength + 1);
    }
  };

  const onResults = async (results) => {
    let canvasCtx = canvasElement?.current?.getContext('2d');
    setCountPrediction(countPrediction++);
    if (countPrediction == 1) {
      setLoading(false);
    }

    canvasCtx?.save();
    canvasCtx?.clearRect(
      0,
      0,
      canvasElement.current.width,
      canvasElement.current.height
    );
    canvasCtx?.drawImage(
      results.image,
      0,
      0,
      canvasElement.current.width,
      canvasElement.current.height
    );
    if (results.multiHandLandmarks && results.multiHandedness) {
      let newLandMarks = [];
      for (const landmarks of results.multiHandLandmarks) {
        for (var i = 0; i < 21; i++) {
          let currentLandmark = landmarks[i];
          newLandMarks.push([
            currentLandmark.x,
            currentLandmark.y,
            currentLandmark.z
          ]);
          // For Left hand we are reverting all the positions
          // if (results.multiHandedness[0].label === "Right") {
          //   newLandMarks[i][0] = newLandMarks[i][0] * -1;
          // }
          if (hand == 'right') {
            newLandMarks[i][0] = newLandMarks[i][0] * -1;
          }
        }
        let fingerPoseEstimator = new FingerPoseEstimator(null);
        let fingerPoseResults = fingerPoseEstimator.estimate(newLandMarks);
        // NOTE: We are only accepting hands of a certain size - to have less false positives
        var handSize =
          handAnalyzer.findDistanceBetweenTwoLandMarks(
            newLandMarks[0],
            newLandMarks[5]
          ) * 10;
        if (handSize > 0.7) {
          console.log('have hand');
          setStarted(true);
          drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
            color: '#ff00ff',
            lineWidth: 2
          });
          drawLandmarks(canvasCtx, landmarks, {
            color: 'transparent',
            lineWidth: 0
          });
          if (selectedLetter && !ignore) {
            const response = reactToDOMCursor(
              fingerPoseResults,
              newLandMarks,
              selectedLetter
            );

            if (response.countCorrectFingers == 5) {
              ignore = true; //stop detecting hand this value change after a delay

              //this time out to delay change of current letter after detecting the hand
              setTimeout(() => {
                setScore((prevScore) => prevScore + 1);
                handleSkip();
              }, 500);
            } else if (response.message) {
              // console.log(response.message);
            }
            if (response.lookForLetter) {
              setLookForLetter(response.lookForLetter);
            }
          }
        } else {
          if (selectedLetter) {
            setLookForLetter(new Alphabet().getSpecificLetter(selectedLetter));
          }
        }
      }
    }
    canvasCtx?.restore();
  };
  const hands = useMemo(() => {
    let hands = new window.Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    return hands;
  }, []);
  useEffect(() => {
    if (wordIndex !== 0 && wordIndex !== 9) {
      setShowModal(true);
      setTimeout(() => {
        setShowModal(false);
      }, 1000);
    }
  }, [wordIndex]);
  useEffect(() => {
    if (hands) {
      setStartTime(new Date().getTime());
      hands.onResults(onResults);
    }
    if (countPrediction != 0) {
      setTimeout(() => {
        ignore = false;
      }, 2000);
    }
    let intervalId = setInterval(() => {
      if (startTime) {
        setCurrentTime(new Date());
      }
    }, 1000);
    return () => {
      clearInterval(intervalId);
    };
  }, [selectedLetter, wordLength]);
  useEffect(() => {
    if (videoElement.current) {
      const camera = new window.Camera(videoElement.current, {
        onFrame: async () => {
          await hands.send({ image: videoElement.current });
        }
      });
      camera.start();
    }
    //1121019492052017

    if (started) {
      const levelIndex = Number(searchParams[0].get('level') as String);
      setStartTime(new Date().getTime());
      setShowModal(true);

      setLevel(levelIndex);
      const returnedLevelWords = getLevelWords(fourLetterWords, levelIndex);
      setLevelWords(returnedLevelWords);
      setSelectWord(returnedLevelWords[0]);
      setSelectedLetter(returnedLevelWords[0][0]);
      setTimeout(() => {
        setShowModal(false);
      }, 1000);
    }
  }, [started]);
  if (!started) {
    return (
      <div className="flex w-full">
        {loading && (
          <>
            <BackButton
              url={`/start-level?level=${searchParams[0].get(
                'level'
              )}&hand=${hand}`}
            />
            <Loading word="Loading" />
          </>
        )}

        {!loading && (
          <>
            <BackButton
              url={`/start-level?level=${searchParams[0].get(
                'level'
              )}&hand=${hand}`}
            />
            <div className="flex-[1] justify-between items-center p-5 bg-[#fff6df] flex  flex-col relative">
              <WavingVideo />
            </div>
          </>
        )}
        <div className="flex-[1]  relative">
          {!loading && <StartingVideoOverLay />}
          <video
            style={{ width: '50%', height: '100vh' }}
            ref={videoElement}
            className="input_video hidden"
          ></video>
          <canvas
            className="output_canvas"
            style={{
              width: '100%',
              objectFit: 'fill',
              height: '100vh',
              display: loading ? 'none' : 'block'
            }}
            ref={canvasElement}
          ></canvas>
        </div>
      </div>
    );
  }
  return (
    <div className="flex w-full">
      {loading && (
        <>
          <BackButton url={`/start-level?level=${level}&hand=${hand}`} />
          <Loading word="Loading" />
        </>
      )}

      {!loading && (
        <>
          {showModal && <Modal wordIndex={wordIndex} nextWord={selectedWord} />}
          <BackButton url={`/start-level?level=${level}&hand=${hand}`} />
          <div className="flex-[1] justify-between items-center p-5 bg-[#fff6df] flex  flex-col relative">
            <div className="absolute mr-10 text-2xl flex flex-col gap-2 w-2/3">
              {/* <span className="font-bold text-center  text-[#683aff] ">
                words : {wordIndex + 1}/10
              </span> */}
            </div>
            <div></div>
            <ImageAndWordContainer
              selectedLetter={selectedLetter?.toUpperCase()}
              imgPath={selectedLetter?.toUpperCase()}
            />
            <LeftBottomContainer
              selectedWord={selectedWord}
              handleSkip={handleSkip}
              wordLength={wordLength}
            />
          </div>
        </>
      )}
      <div className="flex-[1]  relative">
        <span className="absolute text-white text-lg m-10">
          {currentTime && startTime
            ? moment(currentTime - startTime).format('mm : ss')
            : ''}
        </span>
        {!loading && (
          <div className="flex absolute left-1/2 mt-5">
            <p className="font-medium text-white m-2 text-2xl">
              {score} Points
            </p>
          </div>
        )}
        {lookForLetter && <Percentage lookForLetter={lookForLetter} />}

        <video
          style={{ width: '50%', height: '100vh' }}
          ref={videoElement}
          className="input_video hidden"
        ></video>
        <canvas
          className="output_canvas"
          style={{
            width: '100%',
            objectFit: 'fill',
            height: '100vh',
            display: loading ? 'none' : 'block'
          }}
          ref={canvasElement}
        ></canvas>
      </div>
    </div>
  );
}
export default Game;
